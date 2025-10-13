import type { UploadedFile, ColumnData, ParseResult } from '../types';

const SAMPLE_SIZE = 50; // Number of rows to sample for analysis

// Popular pastel "Easter egg" colors
const DEFAULT_COLORS = [
    '#A7C7E7', // Blue
    '#F8C8DC', // Pink
    '#B2F2BB', // Green
    '#FFF2B2', // Yellow
    '#D8B4E2', // Purple
];


function getDataType(value: any): 'string' | 'number' | 'boolean' | 'date' | 'mixed' {
  if (value === null || value === undefined || value === '') return 'string'; // Treat empty as string
  if (!isNaN(value) && value.toString().indexOf('.') !== -1) return 'number';
  if (!isNaN(value)) return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (!isNaN(Date.parse(value))) return 'date';
  return 'string';
}


async function parseCsv(file: File): Promise<any[]> {
  // Dynamically import PapaParse using the import map
  const PapaModule = await import('papaparse');
  // Handle cases where the module is wrapped in a 'default' property, which is common with dynamic imports.
  const Papa = PapaModule.default || PapaModule;

  return new Promise((resolve, reject) => {
    // The imported module has a 'parse' method
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: { data: any[]; }) => {
        resolve(results.data);
      },
      error: (error: Error) => {
        reject(error);
      },
    });
  });
}

async function parseXlsx(file: File): Promise<any[]> {
  // Dynamically import SheetJS (xlsx) using the import map
  const XLSX = await import('xlsx');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event: ProgressEvent<FileReader>) => {
      try {
        const data = event.target?.result;
        // The imported module has 'read' and 'utils' properties
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);
        resolve(json);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
}

// --- Row Alignment Helpers ---

function levenshtein(a: string, b: string): number {
    const matrix = Array.from({ length: b.length + 1 }, () => Array(a.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
    for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(matrix[j - 1][i] + 1, matrix[j][i - 1] + 1, matrix[j - 1][i - 1] + cost);
        }
    }
    return matrix[b.length][a.length];
}

function nameSimilarity(name1: string, name2: string): number {
    const distance = levenshtein(name1, name2);
    const maxLength = Math.max(name1.length, name2.length);
    return maxLength === 0 ? 1 : 1 - distance / maxLength;
}

function createSimpleProfile(header: string, data: any[]) {
    const sample = data.slice(0, 100).map(row => row[header]).filter(d => d !== null && d !== undefined && d !== '');
    const valueSet = new Set(sample);
    const uniquenessRatio = valueSet.size / (sample.length || 1);
    const cleanedName = header.toLowerCase().replace(/[\s_-]/g, '');
    return { header, uniquenessRatio, cleanedName };
}

export async function parseFiles(files: File[]): Promise<ParseResult> {
    // 1. Initial parsing into an intermediate format
    const intermediatePromises = files.map(async (file, index) => {
        let data: any[];
        if (file.name.endsWith('.csv')) {
            data = await parseCsv(file);
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            data = await parseXlsx(file);
        } else {
            throw new Error(`Unsupported file type: ${file.name}`);
        }

        if (data.length === 0) {
            return { id: `${file.name}-${index}`, file, name: file.name, rowCount: 0, rawData: [], headers: [] };
        }
        
        const fileId = `${file.name}-${index}`;
        const headers = Object.keys(data[0] || {});
        return { id: fileId, file, name: file.name, rowCount: data.length, rawData: data, headers };
    });
    const intermediateFiles = await Promise.all(intermediatePromises);

    // 2. Row Alignment Logic
    const potentialKeys = intermediateFiles.flatMap(f =>
        f.headers.map(h => {
            const profile = createSimpleProfile(h, f.rawData);
            return { fileId: f.id, fileName: f.name, header: h, cleanedName: profile.cleanedName, uniquenessRatio: profile.uniquenessRatio };
        })
    ).filter(p => p.uniquenessRatio > 0.9); // High uniqueness suggests a key

    let bestMatch: { key1: any, key2: any, score: number } | null = null;
    let maxScore = 0.7; // Minimum confidence for a key match

    for (let i = 0; i < potentialKeys.length; i++) {
        for (let j = i + 1; j < potentialKeys.length; j++) {
            const key1 = potentialKeys[i];
            const key2 = potentialKeys[j];

            if (key1.fileId !== key2.fileId) {
                const score = nameSimilarity(key1.cleanedName, key2.cleanedName);
                if (score > maxScore) {
                    maxScore = score;
                    bestMatch = { key1, key2, score };
                }
            }
        }
    }

    let alignmentResult = { success: false, message: "Could not find a reliable common key to align rows. Sample data may not correspond between files." };
    const finalDataMap = new Map(intermediateFiles.map(f => [f.id, f.rawData]));

    if (bestMatch) {
        const { key1, key2 } = bestMatch;
        const file1Data = finalDataMap.get(key1.fileId)!;
        const file2Data = finalDataMap.get(key2.fileId)!;

        const map1 = new Map(file1Data.map(row => [row[key1.header], row]));
        const map2 = new Map(file2Data.map(row => [row[key2.header], row]));

        const commonKeys = [...map1.keys()].filter(k => k !== null && k !== undefined && map2.has(k));

        if (commonKeys.length > 10) { // Require a decent number of common rows
            const alignedKeys = commonKeys;
            
            const newFile1Data = alignedKeys.map(k => map1.get(k)!);
            const newFile2Data = alignedKeys.map(k => map2.get(k)!);

            finalDataMap.set(key1.fileId, newFile1Data);
            finalDataMap.set(key2.fileId, newFile2Data);
            
            alignmentResult = {
                success: true,
                message: `Successfully aligned rows between "${key1.fileName}" and "${key2.fileName}" using columns "${key1.header}" and "${key2.header}". Sample data is now synchronized for these files.`
            };
        } else {
            alignmentResult.message = `Found potential key columns ("${key1.header}" and "${key2.header}") but they had too few common values (${commonKeys.length}) to align rows confidently.`;
        }
    }

    // 3. Final processing into UploadedFile format
    const uploadedFiles: UploadedFile[] = intermediateFiles.map((f, index) => {
        const data = finalDataMap.get(f.id)!;
        const columns: ColumnData[] = f.headers.map(header => {
            const sampleData = data.slice(0, SAMPLE_SIZE).map(row => row[header]).filter(val => val !== null && val !== undefined);
            const types = sampleData.map(getDataType);
            const predominantType = types.length > 0 ? types.reduce((a, b, i, arr) => (arr.filter(v => v===a).length >= arr.filter(v => v===b).length ? a : b)) : 'string';

            return {
                fileId: f.id,
                fileName: f.name,
                originalName: header,
                sampleData: sampleData,
                dataType: predominantType,
            };
        });

        return {
            id: f.id,
            file: f.file,
            name: f.name,
            columns,
            rowCount: f.rowCount,
            sourceId: index + 1, // Assign a 1-based source ID
            color: DEFAULT_COLORS[index % DEFAULT_COLORS.length], // Assign a default color
        };
    });

    return { uploadedFiles, alignmentResult };
}
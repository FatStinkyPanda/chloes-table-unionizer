import type { UploadedFile, ColumnData, Match } from '../types';
import { MatchStatus, MatchSource } from '../types';

// --- Interfaces for the new engine ---

interface ColumnProfile {
  source: ColumnData;
  // Content Stats
  uniquenessRatio: number;
  valueSet: Set<any>;
  // Name Stats
  cleanedName: string;
  baseName: string; // Name without common suffixes
  // Numeric Stats (if applicable)
  numericStats?: {
    mean: number;
    stddev: number;
    min: number;
    max: number;
    range: number;
    orderOfMagnitude: number;
  };
}

// --- Profiling and Feature Engineering ---

function getNumericStats(data: any[]) {
    const numericData = data.map(Number).filter(n => !isNaN(n));
    if (numericData.length < 2) return null;

    const n = numericData.length;
    const sum = numericData.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const min = Math.min(...numericData);
    const max = Math.max(...numericData);
    const stddev = Math.sqrt(numericData.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / n);
    
    return { 
        mean, stddev, min, max, range: max-min,
        orderOfMagnitude: Math.floor(Math.log10(Math.abs(mean) || 1))
    };
}


function createColumnProfile(column: ColumnData): ColumnProfile {
  const sampleData = column.sampleData.filter(d => d !== null && d !== undefined && d !== '');
  const nonNullCount = sampleData.length || 1;
  const valueSet = new Set(sampleData);

  const cleanedName = column.originalName.toLowerCase().replace(/[\s_-]/g, '');
  const baseName = cleanedName.replace(/id$|pk$|key$|num$|code$|date$|name$|at$|by$/, '');

  const profile: ColumnProfile = {
    source: column,
    uniquenessRatio: valueSet.size / nonNullCount,
    valueSet,
    cleanedName,
    baseName,
  };

  if (column.dataType === 'number' && sampleData.length > 1) {
    profile.numericStats = getNumericStats(sampleData) || undefined;
  }

  return profile;
}

// --- Advanced Similarity Metrics ---

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

function jaccardSimilarity(set1: Set<any>, set2: Set<any>): number {
    if (set1.size === 0 || set2.size === 0) return 0;
    const intersectionSize = new Set([...set1].filter(x => set2.has(x))).size;
    const unionSize = set1.size + set2.size - intersectionSize;
    return unionSize === 0 ? 1 : intersectionSize / unionSize;
}


// --- Main Confidence Calculation Engine ---

function calculateConfidence(prof1: ColumnProfile, prof2: ColumnProfile): number {
  // Hard Rule: Data types must match. This is the most important filter.
  if (prof1.source.dataType !== prof2.source.dataType) {
    return 0;
  }
  
  const baseNameSim = nameSimilarity(prof1.baseName, prof2.baseName);
  const fullNameSim = nameSimilarity(prof1.cleanedName, prof2.cleanedName);
  const nameSim = Math.max(baseNameSim, fullNameSim);

  // Rule 1: Boolean columns
  if (prof1.source.dataType === 'boolean') {
      const contentSim = jaccardSimilarity(prof1.valueSet, prof2.valueSet);
      return (nameSim * 0.6) + (contentSim * 0.4);
  }

  // Rule 2: High Uniqueness (likely IDs)
  if (prof1.uniquenessRatio > 0.9 && prof2.uniquenessRatio > 0.9) {
    // For IDs, name is almost everything. Content similarity is useless.
    return nameSim * 0.95;
  }

  // Rule 3: Numeric columns
  if (prof1.numericStats && prof2.numericStats) {
    // Check if numbers are on a similar scale. Drastically different scales are unlikely matches.
    const scaleSimilarity = 1 - Math.min(1, Math.abs(prof1.numericStats.orderOfMagnitude - prof2.numericStats.orderOfMagnitude) / 5);
    if (scaleSimilarity < 0.5) return nameSim * 0.2; // Penalize heavily if scales are very different
    
    // Compare Coefficient of Variation (scaled standard deviation) for distribution shape
    const cv1 = prof1.numericStats.mean !== 0 ? prof1.numericStats.stddev / prof1.numericStats.mean : 0;
    const cv2 = prof2.numericStats.mean !== 0 ? prof2.numericStats.stddev / prof2.numericStats.mean : 0;
    const cvSimilarity = 1 - Math.min(1, Math.abs(cv1 - cv2));

    return (nameSim * 0.5) + (cvSimilarity * 0.3) + (scaleSimilarity * 0.2);
  }
  
  // Rule 4: Categorical/General String columns
  const contentSim = jaccardSimilarity(prof1.valueSet, prof2.valueSet);
  if (prof1.uniquenessRatio < 0.5 && prof2.uniquenessRatio < 0.5 && contentSim > 0.1) {
    // For low-uniqueness columns with some overlap, content is very important.
    return (contentSim * 0.7) + (nameSim * 0.3);
  }

  // Fallback for general strings
  return (nameSim * 0.7) + (contentSim * 0.3);
}

// --- New Clustering Logic ---

function findMostDescriptiveName(cluster: ColumnProfile[]): string {
    return cluster.reduce((best, current) => 
        current.source.originalName.length > best.length ? current.source.originalName : best, 
        cluster[0].source.originalName
    );
}

export function generateMatches(files: UploadedFile[]): { matches: Match[], unmatched: ColumnData[] } {
    if (files.length < 2) return { matches: [], unmatched: [] };

    const profiles = files.flatMap(f => f.columns.map(createColumnProfile));
    
    // 1. Find the best potential match for each column
    const bestPairs = new Map<string, { targetKey: string, score: number }>();
    for (let i = 0; i < profiles.length; i++) {
        let bestMatch = { targetKey: '', score: 0 };
        const prof1 = profiles[i];
        const prof1Key = `${prof1.source.fileId}-${prof1.source.originalName}`;

        for (let j = 0; j < profiles.length; j++) {
            if (i === j) continue;
            const prof2 = profiles[j];
            
            // Only compare columns from different files
            if (prof1.source.fileId !== prof2.source.fileId) {
                const score = calculateConfidence(prof1, prof2);
                if (score > bestMatch.score) {
                    bestMatch = { targetKey: `${prof2.source.fileId}-${prof2.source.originalName}`, score };
                }
            }
        }
        
        // Only consider high-confidence best matches
        if (bestMatch.score > 0.65) {
             // To avoid duplicates, we store pairs canonically (e.g., A->B and B->A both stored as A-B)
            const prof2Key = bestMatch.targetKey;
            const canonicalKey = [prof1Key, prof2Key].sort().join('|');
            if(!bestPairs.has(canonicalKey)){
                bestPairs.set(canonicalKey, {targetKey: prof2Key, score: bestMatch.score});
            }
        }
    }
    
    // 2. Build clusters from the high-confidence pairs (transitive closure)
    const profileMap = new Map(profiles.map(p => [`${p.source.fileId}-${p.source.originalName}`, p]));
    const clusters = new Map<string, string[]>();
    const visited = new Set<string>();

    for (const pairKey of bestPairs.keys()) {
        const [key1, key2] = pairKey.split('|');
        
        if (visited.has(key1) || visited.has(key2)) continue;

        const currentCluster = new Set<string>();
        const queue = [key1, key2];
        visited.add(key1);
        visited.add(key2);

        while (queue.length > 0) {
            const currentKey = queue.shift()!;
            currentCluster.add(currentKey);

            for (const otherPairKey of bestPairs.keys()) {
                const [p1, p2] = otherPairKey.split('|');
                if (p1 === currentKey && !visited.has(p2)) {
                    visited.add(p2);
                    queue.push(p2);
                }
                if (p2 === currentKey && !visited.has(p1)) {
                    visited.add(p1);
                    queue.push(p1);
                }
            }
        }
        clusters.set(key1, Array.from(currentCluster));
    }


    // 3. Convert valid clusters into Match objects
    const matches: Match[] = Array.from(clusters.values()).map((clusterKeys, index) => {
        const clusterProfiles = clusterKeys.map(key => profileMap.get(key)!);
        
        let totalScore = 0;
        let pairCount = 0;
        for(const pairKey of bestPairs.keys()){
            const [p1, p2] = pairKey.split('|');
            if(clusterKeys.includes(p1) && clusterKeys.includes(p2)){
                totalScore += bestPairs.get(pairKey)!.score;
                pairCount++;
            }
        }
        const confidence = pairCount > 0 ? totalScore / pairCount : 0;

        return {
            id: `match-${index}`,
            columns: clusterProfiles.map(p => ({
                fileId: p.source.fileId,
                fileName: p.source.fileName,
                columnName: p.source.originalName,
            })),
            programmaticConfidence: confidence,
            status: MatchStatus.PENDING,
            source: MatchSource.PROGRAMMATIC,
            finalName: findMostDescriptiveName(clusterProfiles),
        };
    });

    const matchedColumnKeys = new Set(Array.from(clusters.values()).flat());
    const allColumns = files.flatMap(f => f.columns);
    const unmatched = allColumns.filter(c => !matchedColumnKeys.has(`${c.fileId}-${c.originalName}`));

    matches.sort((a, b) => (b.programmaticConfidence || 0) - (a.programmaticConfidence || 0));

    return { matches, unmatched };
}

export function compareColumnContents(
    columnA: ColumnData,
    columnB: ColumnData
): { score: number; summary: string; details: Record<string, any> } {
    const details: Record<string, any> = {};

    if (columnA.dataType !== columnB.dataType) {
        return {
            score: 0,
            summary: `Data types are different (${columnA.dataType} vs ${columnB.dataType}), which is a strong indicator they should not be matched.`,
            details: { dataTypeMismatch: true }
        };
    }
    details.dataType = columnA.dataType;

    const sampleA = columnA.sampleData.filter(d => d !== null && d !== undefined && d !== '');
    const sampleB = columnB.sampleData.filter(d => d !== null && d !== undefined && d !== '');

    if (sampleA.length === 0 || sampleB.length === 0) {
        return { score: 0.1, summary: "One or both columns have no sample data to compare.", details: { noData: true } };
    }

    let contentScore = 0;
    let summary = "";

    if (columnA.dataType === 'number') {
        const statsA = getNumericStats(sampleA);
        const statsB = getNumericStats(sampleB);
        details.statsA = statsA;
        details.statsB = statsB;

        if (!statsA || !statsB) {
            return { score: 0.1, summary: "Could not compute numeric stats for comparison.", details };
        }
        
        const magnitudeDiff = Math.abs(statsA.orderOfMagnitude - statsB.orderOfMagnitude);
        const magnitudeScore = Math.max(0, 1 - magnitudeDiff / 5);

        const cvA = statsA.mean !== 0 ? Math.abs(statsA.stddev / statsA.mean) : 0;
        const cvB = statsB.mean !== 0 ? Math.abs(statsB.stddev / statsB.mean) : 0;
        const cvSimilarity = cvA === 0 && cvB === 0 ? 1 : 1 - Math.min(1, Math.abs(cvA - cvB) / (cvA + cvB || 1));
        
        contentScore = (magnitudeScore * 0.6) + (cvSimilarity * 0.4);

        summary = `Numeric comparison results:
- Scale similarity score: ${Math.round(magnitudeScore * 100)}%. ${magnitudeDiff > 2 ? 'Warning: Values are on very different scales.' : 'Values are on a similar scale.'}
- Distribution shape similarity score: ${Math.round(cvSimilarity * 100)}%.`;

    } else { // string, date, boolean, mixed
        const setA = new Set(sampleA);
        const setB = new Set(sampleB);
        const jaccard = jaccardSimilarity(setA, setB);
        details.jaccardSimilarity = jaccard;

        const avgLengthA = sampleA.reduce((acc, v) => acc + String(v).length, 0) / sampleA.length;
        const avgLengthB = sampleB.reduce((acc, v) => acc + String(v).length, 0) / sampleB.length;
        const lengthSimilarity = 1 - Math.abs(avgLengthA - avgLengthB) / Math.max(avgLengthA, avgLengthB, 1);
        details.averageLengthA = avgLengthA;
        details.averageLengthB = avgLengthB;
        details.lengthSimilarity = lengthSimilarity;

        contentScore = (jaccard * 0.7) + (lengthSimilarity * 0.3);
        summary = `Content comparison results:
- Value overlap score (Jaccard): ${Math.round(jaccard * 100)}%.
- Average content length similarity score: ${Math.round(lengthSimilarity * 100)}%.`;
    }
  
    return { score: contentScore, summary, details };
}
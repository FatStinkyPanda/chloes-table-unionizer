# Chloe's Table Unionizer

**Intelligent Data Union Assistant**

A web application designed to simplify comparing and merging data from multiple Excel and CSV files. Upload your files, match columns intelligently, and generate ready-to-use Snowflake SQL for data union operations.

## Features

- **Multi-Format File Support**: Upload Excel (.xlsx, .xls) and CSV (.csv) files
- **Intelligent Column Matching**:
  - AI-powered analysis using Google Gemini API to automatically find matching columns
  - Manual matching option for complete control
- **Row Alignment**: Automatically aligns rows across files for accurate data comparison
- **Snowflake SQL Generation**: Generates production-ready SQL UNION queries with proper column aliasing
- **Easy Export**: Copy generated SQL directly to clipboard

## How It Works

1. **Upload Files**: Select two or more Excel or CSV files
2. **Choose Your Approach**:
   - **Analyze & Find Matches**: Let AI suggest column matches
   - **Start with these files**: Begin with manual matching
3. **Review and Refine**: Confirm, modify, or add column matches
4. **Generate SQL**: Get your Snowflake SQL UNION query ready to use

## Tech Stack

- **React 19** with **TypeScript** - Modern UI framework
- **Vite** - Fast build tool and dev server
- **Tailwind CSS** - Utility-first styling
- **Google Gemini API** (`@google/genai`) - AI-powered column matching
- **PapaParse** - CSV file parsing
- **SheetJS** (`xlsx`) - Excel file parsing
- **vite-plugin-singlefile** - Standalone HTML build

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- Google Gemini API key (optional, for AI-powered matching)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/chloes-table-unionizer.git
   cd chloes-table-unionizer
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. (Optional) Configure Gemini API for AI matching:
   - Create a `.env.local` file
   - Add your API key:
     ```
     GEMINI_API_KEY=your_api_key_here
     ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open http://localhost:3000 in your browser

### Building for Production

Build a standalone HTML file:

```bash
npm run build
```

The built application will be in the `dist` folder as a single HTML file that can be opened directly in any browser.

## Project Structure

```
├── components/          # React UI components
│   ├── Header.tsx
│   ├── Footer.tsx
│   ├── FileUploadStep.tsx
│   ├── MatchingStep.tsx
│   ├── ResultsStep.tsx
│   └── ...
├── services/           # Business logic
│   ├── parserService.ts
│   └── matchingService.ts
├── App.tsx            # Main application
├── types.ts           # TypeScript types
└── vite.config.ts     # Build configuration
```

## Developer

**Daniel A Bissey (FatStinkyPanda)**

- Email: [support@fatstinkypanda.com](mailto:support@fatstinkypanda.com)
- Support: [Venmo @FatStinkyPanda](https://venmo.com/u/FatStinkyPanda)

If this tool has made your life a little easier, please consider supporting its development via Venmo.

## License

MIT License - Free to use for any purpose.

## Acknowledgments

Built with:
- [React](https://react.dev/) - UI framework
- [Vite](https://vitejs.dev/) - Build tool
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Google Gemini API](https://ai.google.dev/) - AI-powered matching
- [PapaParse](https://www.papaparse.com/) - CSV parsing
- [SheetJS](https://sheetjs.com/) - Excel file processing

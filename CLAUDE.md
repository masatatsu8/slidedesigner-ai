# CLAUDE.md - InfographAI Codebase Guide

This document provides comprehensive guidance for AI assistants working with the InfographAI codebase.

## Project Overview

**InfographAI** is a web application that transforms text into professional 16:9 infographics using Google's Gemini 3 Pro Image API. The app is designed for Google AI Studio deployment.

**Key Capabilities:**
- AI-powered infographic generation with parallel draft creation
- Style reference image support for guiding visual output
- Real-time refinement with AI-generated suggestions
- PowerPoint export with animated reveal presentations
- Google Drive integration for automatic cloud storage
- Cost tracking for API usage

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | React 19.2.0 |
| Language | TypeScript 5.8.2 |
| Build Tool | Vite 6.2.0 |
| Styling | Tailwind CSS (CDN) |
| AI API | @google/genai 1.30.0 (Gemini) |
| Export | pptxgenjs 3.12.0 |
| Cloud | Google Drive API v3 |

## Project Structure

```
slidedesigner-ai/
├── App.tsx                 # Main application component (state machine, UI)
├── index.tsx               # React DOM entry point
├── index.html              # HTML template with Tailwind CDN + import maps
├── types.ts                # TypeScript type definitions & enums
├── vite.config.ts          # Vite configuration (port 3000)
├── tsconfig.json           # TypeScript compiler options
├── package.json            # Dependencies and scripts
├── metadata.json           # AI Studio app metadata
├── README.md               # User documentation
├── components/
│   ├── Header.tsx          # Navigation header with Drive status
│   └── Spinner.tsx         # Loading indicator
└── services/
    ├── geminiService.ts    # Gemini API integration (image generation)
    ├── driveService.ts     # Google Drive OAuth & upload
    └── pptService.ts       # PowerPoint generation
```

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (port 3000, host 0.0.0.0)
npm run build        # Production build
npm run preview      # Preview production build
```

## Environment Setup

Create `.env.local` in the project root:
```
GEMINI_API_KEY=your_gemini_api_key_here
```

The API key is injected via Vite's `loadEnv()` in `vite.config.ts`.

## Architecture Patterns

### State Machine (AppState enum in types.ts)

```
INPUT → GENERATING → GALLERY ↔ REFINING
```

- **INPUT**: User enters text, selects complexity/resolution, optionally uploads style reference
- **GENERATING**: Parallel generation of 3 infographic drafts
- **GALLERY**: Display generated images, user selects one
- **REFINING**: User provides refinement prompt, edits selected image

### Service Layer Pattern

All external API interactions are encapsulated in `/services/`:

**geminiService.ts** - AI operations:
- `generateInfographicDrafts()` - Creates 3 parallel drafts
- `editInfographic()` - Refines existing image
- `getRefinementSuggestions()` - AI-generated improvement suggestions
- `analyzeImageSplitPoints()` - Detects sections for PPT animation
- `calculateUsage()` - Token cost calculation (Input: $2/1M, Output: $12/1M)

**driveService.ts** - Google Drive operations:
- `initGoogleAuth()` - Initialize OAuth client
- `requestAccessToken()` - Trigger OAuth flow
- `isAuthenticated()` - Check token validity with 60s buffer
- `uploadImageToDrive()` - Upload PNG with multipart/related
- `getAppFolderId()` - Find/create "InfographAI" folder

**pptService.ts** - Export operations:
- `generatePowerPoint()` - Creates animated reveal presentation

### Component Patterns

- **Single File Components**: Components use inline Tailwind classes
- **Hooks-based State**: All state management via React hooks (no Redux/Context)
- **Auto-scroll**: Uses `useRef` + `scrollIntoView()` for navigation

## Key Types (types.ts)

```typescript
enum AppState { INPUT, GENERATING, GALLERY, REFINING }
enum ComplexityLevel { SOLID, LIGHT, VERY_SIMPLE }
type ImageResolution = '1K' | '2K' | '4K'

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalCost: number
}

interface GeneratedImage {
  id: string;
  url: string;
  base64: string;
  prompt: string;
  usage: TokenUsage;
}
```

## API Integration Details

### Gemini API Models Used

| Model | Purpose |
|-------|---------|
| `gemini-3-pro-image-preview` | Image generation and editing |
| `gemini-2.5-flash` | Text analysis (suggestions, split points) |

### Generation Parameters

- **Aspect Ratio**: Always 16:9
- **Resolution Options**: 1K, 2K, 4K
- **Complexity Levels**: VERY_SIMPLE, LIGHT, SOLID (affects prompt detail)
- **Parallel Drafts**: 3 images generated simultaneously via `Promise.all()`

### Google Drive Integration

- **OAuth Scope**: `https://www.googleapis.com/auth/drive.file` (app-created files only)
- **Folder**: Creates "InfographAI" folder automatically
- **Upload**: Multipart FormData with JSON metadata + binary image
- **Token Storage**: Token expiry tracked with 60-second buffer

## UI Language

The application UI is entirely in **Japanese**. All user-facing strings, prompts, and labels are in Japanese.

## Code Conventions

### TypeScript
- Strict type checking enabled
- Path aliases: `@/*` maps to project root
- Centralized types in `types.ts`

### Styling
- Tailwind CSS utility classes (CDN in index.html)
- No separate CSS files
- Indigo color scheme (`indigo-600`, `indigo-500`, etc.)

### Error Handling
- Try/catch blocks in service functions
- User-facing errors stored in `error` state
- Fallback values for API failures (e.g., default suggestions)

### File Naming
- Components: PascalCase (`Header.tsx`, `Spinner.tsx`)
- Services: camelCase with "Service" suffix (`geminiService.ts`)
- All source files use `.tsx` or `.ts` extensions

## CDN Dependencies (index.html)

The app uses import maps for CDN-hosted dependencies (AI Studio requirement):

```html
<script type="importmap">
{
  "imports": {
    "react": "https://aistudiocdn.com/react@19.2.0/+esm",
    "react-dom/client": "https://aistudiocdn.com/react-dom@19.2.0/client/+esm",
    "@google/genai": "https://aistudiocdn.com/@google/genai@1.30.0/+esm",
    "uuid": "https://aistudiocdn.com/uuid@13.0.0/+esm",
    "pptxgenjs": "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.es.js",
    "jszip": "https://cdn.skypack.dev/jszip@3.10.1"
  }
}
</script>
```

## Common Development Tasks

### Adding a New Service Function

1. Add the function to the appropriate service file in `/services/`
2. Export it from the service file
3. Import and use in `App.tsx`
4. Handle loading states and errors appropriately

### Adding a New UI Component

1. Create component file in `/components/` (PascalCase)
2. Use Tailwind classes for styling
3. Import and use in `App.tsx`
4. Keep Japanese language for user-facing text

### Modifying Generation Logic

1. Update prompts in `geminiService.ts`
2. Adjust `ComplexityLevel` mappings if needed
3. Test with different input combinations
4. Verify cost calculation accuracy

### Updating Types

1. Modify or add types in `types.ts`
2. Update all consumers of the type
3. Ensure TypeScript compilation succeeds

## Testing

**Note**: No testing framework is currently configured. The project has no test files, test dependencies, or test scripts.

If adding tests, consider:
- **Vitest** (integrates well with Vite)
- Mock `@google/genai` for service tests
- Component testing with React Testing Library

## Important Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `App.tsx` | ~993 | Main app component, all state management |
| `geminiService.ts` | ~310 | Gemini API integration |
| `driveService.ts` | ~186 | Google Drive OAuth and upload |
| `pptService.ts` | ~123 | PowerPoint generation |
| `types.ts` | ~38 | Type definitions |
| `Header.tsx` | ~73 | Header component |

## Security Considerations

- `GEMINI_API_KEY` must be in `.env.local` (gitignored)
- Google OAuth uses limited `drive.file` scope
- Client ID is configurable (stored in localStorage)
- No server-side component - all client-side

## Known Limitations

1. **Large App Component**: `App.tsx` contains all UI logic (~993 lines) - could benefit from component extraction
2. **No Tests**: No test coverage or testing framework
3. **No Linting**: No ESLint or Prettier configuration
4. **No CI/CD**: No deployment automation
5. **Client-side Only**: All API calls happen in browser (API key exposed to client)

## Git Workflow

- Main development happens on feature branches
- Commits should follow conventional format: `feat:`, `fix:`, `docs:`, etc.
- No pre-commit hooks configured

import '@testing-library/jest-dom/vitest';

// Mock for sql.js WASM loading
vi.mock('sql.js', async () => {
  const actual = await vi.importActual('sql.js');
  return actual;
});

// Global test utilities
beforeEach(() => {
  // Reset any mocks before each test
});

afterEach(() => {
  // Cleanup after each test
});

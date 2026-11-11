/**
 * test-setup — the DOM matchers, registered the way this workspace can take.
 *
 * The `/matchers` entry, registered by hand: it works with every runner
 * version the workspace has pinned. Its `/vitest` entry broke under the 1.6
 * line (Oikos, 76 tests that never ran); the draft package.json asks 3.2.
 */
import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

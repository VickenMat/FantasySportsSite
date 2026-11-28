import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['control-center/*.test.ts'],fileParallelism:false,testTimeout:10000}});

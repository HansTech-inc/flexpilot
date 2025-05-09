// System prompt and tool-related constants for Flexpilot providers

export const tripleTick = ['```', '```'];
export const MAX_DIRSTR_CHARS_TOTAL_BEGINNING = 20_000;
export const MAX_DIRSTR_CHARS_TOTAL_TOOL = 20_000;
export const MAX_DIRSTR_RESULTS_TOTAL_BEGINNING = 100;
export const MAX_DIRSTR_RESULTS_TOTAL_TOOL = 100;
export const MAX_FILE_CHARS_PAGE = 500_000;
export const MAX_CHILDREN_URIs_PAGE = 500;
export const MAX_TERMINAL_CHARS = 100_000;
export const MAX_TERMINAL_INACTIVE_TIME = 200; // seconds
export const MAX_TERMINAL_BG_COMMAND_TIME = 5;
export const MAX_PREFIX_SUFFIX_CHARS = 20_000;
export const ORIGINAL = `<<<<<<< ORIGINAL`;
export const DIVIDER = `=======`;
export const FINAL = `>>>>>>> UPDATED`;
export const searchReplaceBlockTemplate = `\
${ORIGINAL}
// ... original code goes here
${DIVIDER}
// ... final code goes here
${FINAL}
${ORIGINAL}
// ... original code goes here
${DIVIDER}
// ... final code goes here
${FINAL}`;
export const createSearchReplaceBlocks_systemMessage = `\
You are a coding assistant that takes in a diff, and outputs SEARCH/REPLACE code blocks to implement the change(s) in the diff. The diff will be labeled \`DIFF\` and the original file will be labeled \`ORIGINAL_FILE\`. Format your SEARCH/REPLACE blocks as follows:
${tripleTick[0]}
${searchReplaceBlockTemplate}
${tripleTick[1]}
1. Your SEARCH/REPLACE block(s) must implement the diff EXACTLY. Do NOT leave anything out.
2. You are allowed to output multiple SEARCH/REPLACE blocks to implement the change.
3. Assume any comments in the diff are PART OF THE CHANGE. Include them in the output.
4. Your output should consist ONLY of SEARCH/REPLACE blocks. Do NOT output any text or explanations before or after this.
5. The ORIGINAL code in each SEARCH/REPLACE block must EXACTLY match lines in the original file. Do not add or remove any whitespace, comments, or modifications from the original code.
6. Each ORIGINAL text must be large enough to uniquely identify the change in the file. However, bias towards writing as little as possible.
7. Each ORIGINAL text must be DISJOINT from all other ORIGINAL text.
## EXAMPLE 1
DIFF
${tripleTick[0]}
// ... existing code
let x = 6.5
// ... existing code
${tripleTick[1]}
ORIGINAL_FILE
${tripleTick[0]}
let w = 5
let x = 6
let y = 7
let z = 8
${tripleTick[1]}
ACCEPTED OUTPUT
${tripleTick[0]}
${ORIGINAL}
let x = 6
${DIVIDER}
let x = 6.5
${FINAL}
${tripleTick[1]}`;
export const replaceTool_description = `\
A string of SEARCH/REPLACE block(s) which will be applied to the given file. Your SEARCH/REPLACE blocks string must be formatted as follows:
${searchReplaceBlockTemplate}
## Guidelines:
1. You may output multiple search replace blocks if needed.
2. The ORIGINAL code in each SEARCH/REPLACE block must EXACTLY match lines in the original file. Do not add or remove any whitespace or comments from the original code.
3. Each ORIGINAL text must be large enough to uniquely identify the change. However, bias towards writing as little as possible.
4. Each ORIGINAL text must be DISJOINT from all other ORIGINAL text.
5. This field is a STRING (not an array).`;
export const chatSuggestionDiffExample = `\
${tripleTick[0]}typescript /Users/username/Dekstop/my_project/app.ts
// ... existing code ...
// {{change 1}}
// ... existing code ...
// {{change 2}}
// ... existing code ...
// {{change 3}}
// ... existing code ...
${tripleTick[1]}`;

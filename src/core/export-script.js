/**
 * Export a notebook as a plain script in the "percent" cell format that
 * Jupytext, VS Code, Spyder, and PyCharm all understand — handy for
 * diffing, code review, and running outside the notebook.
 */

const LANGUAGES = {
  python: { comment: '#', extension: '.py' },
  javascript: { comment: '//', extension: '.js' },
  bash: { comment: '#', extension: '.sh' }
};

export function scriptExtension(kernelName) {
  return (LANGUAGES[kernelName] ?? LANGUAGES.python).extension;
}

export function toScript(state) {
  const { comment } = LANGUAGES[state.metadata.kernelName] ?? LANGUAGES.python;
  const sections = state.cells.map((cell) => {
    if (cell.type === 'code') {
      return `${comment} %%\n${cell.source}`;
    }
    const marker = cell.type === 'markdown' ? `${comment} %% [markdown]` : `${comment} %% [raw]`;
    const body = cell.source
      .split('\n')
      .map((line) => (line === '' ? comment : `${comment} ${line}`))
      .join('\n');
    return `${marker}\n${body}`;
  });
  return sections.join('\n\n') + '\n';
}

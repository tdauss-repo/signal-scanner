interface AiPromptPanelProps {
  prompts: string[]
}

export function AiPromptPanel({ prompts }: AiPromptPanelProps) {
  const copyPrompt = async (prompt: string) => {
    await navigator.clipboard.writeText(prompt)
  }

  return (
    <div className="prompt-panel">
      <p className="eyebrow">Copyable AI Prompts</p>
      <div className="prompt-list">
        {prompts.map((prompt) => (
          <div className="prompt-row" key={prompt}>
            <p>{prompt}</p>
            <button
              type="button"
              className="secondary"
              onClick={() => void copyPrompt(prompt)}
            >
              Copy
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

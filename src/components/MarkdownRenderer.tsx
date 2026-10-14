"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatGenerationMeta, splitGenerationMeta } from "../lib/generationMeta";

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const { body, meta } = splitGenerationMeta(content);

  return (
    <div className="markdown-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
      {meta ? <p className="ai-generation-meta">{formatGenerationMeta(meta)}</p> : null}
    </div>
  );
}

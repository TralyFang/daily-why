export const GENERATION_FAILURE_TITLE = "为什么今天的内容还没准备好？";

export function buildGenerationFailureContent(errorMessage: string): string {
  return `# ${GENERATION_FAILURE_TITLE}\n\n很抱歉，今天的内容生成遇到了一些技术问题。\n\n错误信息：${errorMessage}\n\n> 好奇心永不过期，明天再来探索新问题！`;
}

export function isGenerationFailureContent(content: string | null | undefined): boolean {
  if (!content) return false;
  return content.includes(`# ${GENERATION_FAILURE_TITLE}`);
}

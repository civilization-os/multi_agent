/**
 * 跨智能体共享黑板 (Blackboard)
 * 存放整个房间共知的公开线索池、当前会话/游戏阶段与协同产物 Artifacts
 */
export class Blackboard {
  public readonly roomId: string;
  private stage: string = 'INIT';
  private clues: Map<string, string> = new Map();
  private artifacts: Map<string, unknown> = new Map();
  private metadata: Map<string, unknown> = new Map();

  constructor(roomId: string) {
    this.roomId = roomId;
  }

  public setStage(stage: string): void {
    this.stage = stage;
  }

  public getStage(): string {
    return this.stage;
  }

  public addPublicClue(key: string, content: string): void {
    this.clues.set(key, content);
  }

  public getPublicClues(): Array<{ key: string; content: string }> {
    return Array.from(this.clues.entries()).map(([key, content]) => ({ key, content }));
  }

  public setArtifact(key: string, value: unknown): void {
    this.artifacts.set(key, value);
  }

  public getArtifact<T = unknown>(key: string): T | undefined {
    return this.artifacts.get(key) as T | undefined;
  }

  public getAllArtifacts(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of this.artifacts.entries()) {
      result[key] = value;
    }
    return result;
  }

  public setMetadata(key: string, value: unknown): void {
    this.metadata.set(key, value);
  }

  public getMetadata<T = unknown>(key: string): T | undefined {
    return this.metadata.get(key) as T | undefined;
  }

  /**
   * 渲染供 Agent 消费的黑板公开信息摘要
   */
  public renderSummary(): string {
    const cluesList = Array.from(this.clues.entries()).map(
      ([k, v]) => `  - [${k}]: ${v}`
    );
    const artifactKeys = Array.from(this.artifacts.keys());

    return [
      `【当前房间阶段】: ${this.stage}`,
      `【公开线索池】:`,
      cluesList.length > 0 ? cluesList.join('\n') : '  (暂无公开线索)',
      `【共享产物(Artifacts)】: ${artifactKeys.length > 0 ? artifactKeys.join(', ') : '(暂无)'}`,
    ].join('\n');
  }

  public clear(): void {
    this.clues.clear();
    this.artifacts.clear();
    this.metadata.clear();
    this.stage = 'INIT';
  }
}

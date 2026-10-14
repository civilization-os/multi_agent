/**
 * 智能体私有记忆 (AgentMemory)
 * 存放属于该 Agent 个人的私密上下文（如剧本杀秘密底牌、专属作案动机、私人笔记），
 * 绝不会被其他智能体读取。
 */
export class AgentMemory {
  public readonly agentId: string;
  private secretContext?: string;
  private privateNotes: string[] = [];

  constructor(agentId: string, initialSecret?: string) {
    this.agentId = agentId;
    this.secretContext = initialSecret;
  }

  public setSecretContext(secret: string): void {
    this.secretContext = secret;
  }

  public getSecretContext(): string | undefined {
    return this.secretContext;
  }

  public addPrivateNote(note: string): void {
    this.privateNotes.push(note);
  }

  public getPrivateNotes(): string[] {
    return [...this.privateNotes];
  }

  public clearNotes(): void {
    this.privateNotes = [];
  }
}

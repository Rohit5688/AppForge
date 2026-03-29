export class ClarificationRequired extends Error {
  constructor(
    public readonly question: string,
    public readonly context: string,
    public readonly options?: string[]
  ) { 
    super(question);
    this.name = 'ClarificationRequired';
  }
}

export class Questioner {
  static clarify(question: string, context: string, options?: string[]): never {
    throw new ClarificationRequired(question, context, options);
  }
}

export class ClarificationRequired extends Error {
    question;
    context;
    options;
    constructor(question, context, options) {
        super(question);
        this.question = question;
        this.context = context;
        this.options = options;
        this.name = 'ClarificationRequired';
    }
}
export class Questioner {
    static clarify(question, context, options) {
        throw new ClarificationRequired(question, context, options);
    }
}

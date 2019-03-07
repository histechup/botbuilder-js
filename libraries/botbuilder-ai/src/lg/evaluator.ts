
import { AbstractParseTreeVisitor } from "antlr4ts/tree";
import { TerminalNode } from "antlr4ts/tree/TerminalNode";
import { ExpressionEngine } from "botframework-expression";
import { GetMethodExtensions } from "./getMethodExtensions";
import { GetValueExtensions } from "./getValueExtensions";
import { ConditionalBodyContext, LGFileParser, NormalBodyContext,
    NormalTemplateBodyContext, NormalTemplateStringContext, TemplateDefinitionContext } from "./lGFileParser";
import { LGFileParserVisitor } from "./LGFileParserVisitor";
import { EvaluationContext } from "./templateEngine";

class EvaluationTarget {
    public TemplateName: string;
    public Scope: any;
    public constructor(templateName: string, scope: any) {
        this.TemplateName = templateName;
        this.Scope = scope;
    }
}

// tslint:disable-next-line: max-classes-per-file
export class Evaluator extends AbstractParseTreeVisitor<string> implements LGFileParserVisitor<string> {
    public readonly Context: EvaluationContext;
    private readonly evalutationTargetStack: EvaluationTarget[] = [];

    private GetMethodX: GetMethodExtensions;

    private GetValueX: GetValueExtensions;

    constructor(context: EvaluationContext) {
        super();
        this.Context = context;
        this.GetMethodX = new GetMethodExtensions(this);
        this.GetValueX = new GetValueExtensions(this);

    }

    public EvaluateTemplate(templateName: string, scope: any): string {
        if (this.Context.TemplateContexts[templateName] === undefined) {
            throw new Error(`No such template: ${templateName}`);
        }

        if (this.evalutationTargetStack[templateName] !== undefined) {
            throw new Error(`Loop deteced: ${this.evalutationTargetStack.reverse()
                .map((u) => u.TemplateName).join(" => ")}`);
        }

        this.evalutationTargetStack.push(new EvaluationTarget(templateName, scope));
        const result = this.visit(this.Context.TemplateContexts[templateName]);
        this.evalutationTargetStack.pop();
        return result;
    }

    public visitTemplateDefinition(ctx: TemplateDefinitionContext): string {
        const templateNameContext = ctx.templateNameLine();
        if (templateNameContext.templateName().text === this.currentTarget().TemplateName) {
            return this.visit(ctx.templateBody());
        }
        return null;
    }

    public visitNormalBody(ctx: NormalBodyContext): string {
        return this.visit(ctx.normalTemplateBody());
    }

    public visitNormalTemplateBody(ctx: NormalTemplateBodyContext) {
        const normalTemplateStrs = ctx.normalTemplateString();
        const randomNumber = Math.floor(Math.random() * normalTemplateStrs.length);
        return this.visit(normalTemplateStrs[randomNumber]);
    }

    public visitConditionalBody(ctx: ConditionalBodyContext) {
        const caseRules = ctx.conditionalTemplateBody().caseRule();
        for (const caseRule of caseRules) {
            const conditionExpression = caseRule.caseCondition().EXPRESSION().text;
            if (this.EvalCondition(conditionExpression)) {
                return this.visit(caseRule.normalTemplateBody());
            }
        }
        return this.visit(ctx.conditionalTemplateBody().defaultRule().normalTemplateBody());
    }

    public visitNormalTemplateString(ctx: NormalTemplateStringContext): string {
        let result: string = "";
        for (const node of ctx.children) {
            const innerNode: TerminalNode =  node as TerminalNode;
            switch (innerNode.symbol.type) {
                case LGFileParser.DASH: break;
                case LGFileParser.EXPRESSION: {

                    result = result.concat(this.EvalExpression(innerNode.text));
                    break;
                }
                case LGFileParser.TEMPLATE_REF: {
                    result = result.concat(this.EvalTemplateRef(innerNode.text));
                    break;
                }
                case LGFileParser.MULTI_LINE_TEXT: {
                    result = result.concat(this.EvalMultiLineText(innerNode.text));
                    break;
                }
                default: {
                    result = result.concat(innerNode.text);
                    break;
                }
            }
        }
        return result;
    }

    public ConstructScope(templateName: string, args: any[]) {
        if (args.length === 1 &&
            this.Context.TemplateParameters[templateName] === undefined) {
            return args[0];
        }
        const paramters = this.ExtractParamters(templateName);

        if (paramters.length !== args.length) {
            throw new Error(`Arguments count mismatch for template ref ${templateName},
            expected ${paramters.length}, actual ${args.length}`);
        }

        const newScope = {};
        paramters.map((e, i) => newScope[e] = args[i]);
        return newScope;
    }

    protected defaultResult(): string {
        return "";
    }

    private currentTarget(): EvaluationTarget {
        return this.evalutationTargetStack[this.evalutationTargetStack.length - 1];
    }

    private EvalCondition(exp: string): boolean {
        try {
            exp = exp.replace(/(^{*)/g, "").replace(/(}*$)/g, "");
            const result = this.EvalByExpressionEngine(exp, this.currentTarget().Scope);
            if ((typeof (result) === "boolean" && !result) || (typeof (result) === "number" && result === 0)) {
                return false;
            }
            return true;
        } catch (error) {
            console.log(error);
            return false;
        }
    }
    private EvalExpression(exp: string): string {
        exp = exp.replace(/(^{*)/g, "").replace(/(}*$)/g, "");
        const result = this.EvalByExpressionEngine(exp, this.currentTarget().Scope);
        return result;
    }

    private EvalTemplateRef(exp: string) {
        exp = exp.replace(/(^\[*)/g, "").replace(/(\]*$)/g, "");
        const argsStartPos = exp.indexOf("(");
        if (argsStartPos > 0) {
            const argsEndPos = exp.lastIndexOf(")");
            if (argsEndPos < 0 || argsEndPos < argsStartPos + 1) {
                throw new Error(`Not a valid template ref: ${exp}`);
            }

            const argExpressions = exp.substr(argsStartPos + 1, argsEndPos - argsStartPos - 1).split(",");
            const args = argExpressions.map((x) => this.EvalByExpressionEngine(x, this.currentTarget().Scope));
            const templateName = exp.substr(0, argsStartPos);

            const newScope = this.ConstructScope(templateName, args);
            return this.EvaluateTemplate(templateName, newScope);
        }
        return this.EvaluateTemplate(exp, this.currentTarget().Scope);
    }

    private EvalMultiLineText(exp: string): string {

        exp = exp.substr(3, exp.length - 6);

        const result: string = exp.replace(/@\{[^{}]+\}/g, (sub: string) => {

            const newExp: string = sub.substr(1); // remove @
            if (newExp.startsWith("{[") && newExp.endsWith("]}")) {
                return this.EvalTemplateRef(newExp.substr(2, newExp.length - 4)); // [ ]
            } else {
                return this.EvalExpression(newExp); // { }
            }
        });
        return result;
    }

    private ExtractParamters(templateName: string): string[] {
        const result: string[] = [];
        const parameters = this.Context.TemplateParameters[templateName];
        if (parameters === undefined || !(parameters instanceof Array)) {
            return result;
        }
        return parameters;
    }

    private EvalByExpressionEngine(exp: string, scope: any) {
        return ExpressionEngine.EvaluateWithString(exp, scope, this.GetValueX.GetValueX, this.GetMethodX.GetMethodX);
    }
}

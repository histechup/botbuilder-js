import { GetMethodDelegate, MethodBinder } from "botframework-expression";
import { Evaluator } from "./evaluator";

export class GetMethodExtensions {
    private readonly evaluator: Evaluator;

    public constructor(evaluator: Evaluator) {
        this.evaluator = evaluator;
    }

    public GetMethodX: GetMethodDelegate = (name: string) => {

        switch (name) {
            case "count": return this.Count;
            case "join": return this.Join;
            case "foreach": return this.Foreach;
            case "newParameter":
            case "humanize":
                return this.ForeachThenJoin;
            default: return MethodBinder.All(name);
        }
    }

    public Count(paramters: any[]): any {
        if (paramters[0] instanceof Array) {
            const li = paramters[0];
            return li.length;
        }
        throw new Error("NotImplementedException");
    }

    public Join(paramters: any[]): any {
        if (paramters.length === 2 &&
            paramters[0] instanceof Array &&
            typeof (paramters[1]) === "string") {
            const li = paramters[0];
            const sep = paramters[1] + " ";
            return li.join(sep);
        }

        if (paramters.length === 3 &&
            paramters[0] instanceof Array &&
            typeof (paramters[1]) === "string" &&
            typeof (paramters[2] === "string")) {
            const li = paramters[0];
            const sep1 = paramters[1] + " ";
            const sep2 = " " + paramters[2] + " ";
            if (li.length < 3) {
                return li.join(sep2);
            } else {
                const firstPart = li.slice(0, li.length - 1).join(sep1);
                return firstPart + sep2 + li[li.length - 1];
            }
        }

        throw new Error("NotImplementedException");
    }

    public Foreach = (paramters: any[]): any => {
        if (paramters.length === 2 &&
            paramters[0] instanceof Array &&
            typeof (paramters[1]) === "string") {
            const li: any[] = paramters[0];
            const func = paramters[1];

            if (this.evaluator.Context.TemplateContexts[func] === undefined) {
                throw new Error(`No such template defined: ${func}`);
            }

            const result = li.map((x) => {
                const newScope = this.evaluator.ConstructScope(func, [x]);
                const evaled = this.evaluator.EvaluateTemplate(func, newScope);
                return evaled;
            });

            return result;

        }
        throw new Error("NotImplementedException");
    }

    public ForeachThenJoin = (paramters: any[]): any => {
        if (paramters.length >= 2 &&
            paramters[0] instanceof Array &&
            typeof paramters[1] === "string") {
            const li: any[] = paramters[0];
            const func = paramters[1];

            if (this.evaluator.Context.TemplateContexts[func] === undefined) {
                throw new Error(`No such template defined: ${func}`);
            }

            const result = li.map((x) => {
                const newScope = this.evaluator.ConstructScope(func, [x]);
                const evaled = this.evaluator.EvaluateTemplate(func, newScope);
                return evaled;
            });

            const newParameter = paramters.slice(1);
            newParameter[0] = result;
            return this.Join(newParameter);

        }
        throw new Error("NotImplementedException");
    }
}

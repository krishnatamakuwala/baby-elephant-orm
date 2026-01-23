import { JoinType } from "./enums/JoinType";
import { OrderDirection } from "./enums/OrderDirection";
import { QueryAggregateFunction } from "./enums/QueryAggregateFunction";
import { QueryOperator } from "./enums/QueryOperator";

export interface ICondition {
    columnName: string;
    columnValue: string | number | boolean | object;
    operator: QueryOperator; // e.g., '=', '>', '<', 'LIKE', etc.
    tableName?: string;
}

export interface IJoinCondition {
    primaryTableName: string;
    primaryColumnName: string;
    operator: QueryOperator;
    secondaryTableName: string;
    secondaryColumnName: string;
}

export interface IJoin {
    tableName: string;
    tableAliasName?: string;
    joinType: JoinType;
    joinCondition: IJoinCondition[];
}

export interface IUpdate {
    columnName: string;
    columnValue: string | number | boolean | object | null;
    updateIfNull?: boolean;
}

export interface IQueryParams {
    tableName: string;
    columns?: IColumns[]; // For SELECT or INSERT queries
    insertColumns?: string[];
    conditions?: Array<ICondition[]>; // WHERE clause as an object
    joins?: IJoin[];
    limit?: number;
    offset?: number;
    orders?: IOrders[];
}

export interface IOrders {
    columnName: string;
    modelKey: string;
    direction: OrderDirection;
    aliasId?: number;
}

export interface IColumns {
    columnName: string;
    tableName?: string;
    alias?: string;
    aggregateFunction?: QueryAggregateFunction | QueryAggregateFunction[];
}

export interface IPreparedQuery {
    query: string,
    params: unknown[]
}

export interface ICount {
    count: number;
}

export class BaseQuery {
    protected tableName: string;
    protected columns?: IColumns[];
    protected insertColumns?: string[];
    protected conditions?: Array<ICondition[]>;
    protected joins?: IJoin[];
    protected limit?: number;
    protected offset?: number;
    protected orders?: IOrders[];

    constructor(params: IQueryParams) {
        this.tableName = params.tableName;
        this.columns = params.columns;
        this.insertColumns = params.insertColumns;
        this.conditions = params.conditions;
        this.joins = params.joins;
        this.limit = params.limit;
        this.offset = params.offset;
        this.orders = params.orders;
    }

    protected getWhereClause(): IPreparedQuery {
        let whereCondition: string = "";
        const arrParams: unknown[] = [];
        let i: number = 0;

        if (!this.conditions) return { query: whereCondition, params: arrParams };

        const orClauses = this.conditions
            .map((conditionGroup) => {
                const andClauses = conditionGroup
                    .map((condition) => {
                        i++;
                        const isBracketrequired = condition.operator == (QueryOperator.in || QueryOperator.notIn);
                        let query = "";
                        if (condition.operator === QueryOperator.isNotNull || condition.operator === QueryOperator.isNull) {
                            query = `${condition.tableName ?? this.tableName}.${condition.columnName} ${condition.operator}`;
                        } else {
                            arrParams.push(condition.columnValue);
                            query = `${condition.tableName ?? this.tableName}.${condition.columnName} ${condition.operator} ` + (isBracketrequired ? "(" : "") + `$${i}` + (isBracketrequired ? ")" : "");
                        }
                        return query;
                    }).join(" AND ");
                return `(${andClauses})`;
            })
            .join(" OR ");
        whereCondition = `\nWHERE ${orClauses}`;
        return { query: whereCondition, params: arrParams }
    }

    protected getJoinClause(): string | "" {
        let joinClause = this.joins?.map((join) => {
            let strJoin = `\n${join.joinType} JOIN ${join.tableName} as ${join.tableAliasName ?? join.tableName} ON `;
            strJoin += join.joinCondition.map((condition) => {
                return `${condition.primaryTableName}.${condition.primaryColumnName} ${condition.operator} ${condition.secondaryTableName}.${condition.secondaryColumnName}`;
            }).join(" AND ");
            return strJoin;
        }).join("");
        if (!joinClause) {
            joinClause = "";
        }
        return joinClause;
    }
}
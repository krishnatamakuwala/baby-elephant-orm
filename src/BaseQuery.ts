import { JoinType } from "./enums/JoinType";
import { OrderDirection } from "./enums/OrderDirection";
import { QueryAggregateFunction } from "./enums/QueryAggregateFunction";
import { QueryOperator } from "./enums/QueryOperator";

/**
 * Query Condition Clause
 */
export interface ICondition {
    columnName: string;
    columnValue: string | number | boolean | object;
    operator: QueryOperator; // e.g., '=', '>', '<', 'LIKE', etc.
    tableSchema?: ITableSchema;
}

/**
 * Join Condition Cluase
 */
export interface IJoinCondition {
    primaryTableSchema: ITableSchema;
    primaryColumnName: string;
    operator: QueryOperator;
    secondaryTableSchema: ITableSchema;
    secondaryColumnName: string;
}

/**
 * Join Clause
 */
export interface IJoin {
    tableSchema: ITableSchema;
    tableAliasName?: string;
    joinType: JoinType;
    joinCondition: IJoinCondition[];
}

/**
 * Update Clause
 */
export interface IUpdate {
    columnName: string;
    columnValue: string | number | boolean | object | null;
    updateIfNull?: boolean;
}

/**
 * Query Parameters
 */
export interface IQueryParams {
    tableSchema: ITableSchema;
    columns?: IColumns[];
    insertColumns?: string[];
    conditions?: Array<ICondition[]>;
    joins?: IJoin[];
    limit?: number;
    offset?: number;
    orders?: IOrders[];
}

/**
 * Query Order Clause
 */
export interface IOrders {
    columnName: string;
    modelKey: string;
    direction: OrderDirection;
    aliasId?: number;
}

/**
 * Query Select Column Cluase
 */
export interface IColumns {
    columnName: string;
    tableSchema?: ITableSchema;
    alias?: string;
    aggregateFunction?: QueryAggregateFunction | QueryAggregateFunction[];
}

/**
 * Prepared Query
 */
export interface IPreparedQuery {
    query: string,
    params: unknown[]
}

/**
 * Count
 */
export interface ICount {
    count: number;
}

/**
 * Table Schema
 */
export interface ITableSchema {
    schemaName?: string;
    tableName: string;
}

export class BaseQuery {
    protected tableSchema: ITableSchema;
    protected columns?: IColumns[];
    protected insertColumns?: string[];
    protected conditions?: Array<ICondition[]>;
    protected joins?: IJoin[];
    protected limit?: number;
    protected offset?: number;
    protected orders?: IOrders[];

    constructor(params: IQueryParams) {
        this.tableSchema = params.tableSchema;
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
                            query = `${condition.tableSchema ?? this.tableSchema.tableName}.${condition.columnName} ${condition.operator}`;
                        } else {
                            arrParams.push(condition.columnValue);
                            query = `${condition.tableSchema ?? this.tableSchema.tableName}.${condition.columnName} ${condition.operator} ` + (isBracketrequired ? "(" : "") + `$${i}` + (isBracketrequired ? ")" : "");
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
            let strJoin = `\n${join.joinType} JOIN ${join.tableSchema.schemaName ? join.tableSchema.schemaName + "." + join.tableSchema.tableName : join.tableSchema.tableName} as ${join.tableAliasName ?? join.tableSchema.tableName} ON `;
            strJoin += join.joinCondition.map((condition) => {
                return `${condition.primaryTableSchema.schemaName ? condition.primaryTableSchema.schemaName + "." + condition.primaryTableSchema.tableName : condition.primaryTableSchema.tableName}.${condition.primaryColumnName} ${condition.operator} ${condition.secondaryTableSchema.schemaName ? condition.secondaryTableSchema.schemaName + "." + condition.secondaryTableSchema.tableName : condition.secondaryTableSchema.tableName}.${condition.secondaryColumnName}`;
            }).join(" AND ");
            return strJoin;
        }).join("");
        if (!joinClause) {
            joinClause = "";
        }
        return joinClause;
    }
}
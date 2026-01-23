export enum QueryOperator {
    equal = "=",
    notEqual = "!=",
    greaterThan = ">",
    lessThan = "<",
    greaterThanOrEqual = ">=",
    lessThanOrEqual = "<=",
    like = "LIKE",
    iLike = "ILIKE",
    in = "= ANY",
    notIn = "!= ALL",
    isNotNull = "IS NOT NULL",
    isNull = "IS NULL"
}
export class ModelColumnProperyMapping {

    /**
     * Get column mappings of model
     * @param modelClass Model class
     * @returns Column mappings
     */
    public static getColumnMappings<T>(modelClass: new () => T): Record<string, string> {
        let mappings: Record<string, string> = {};
    
        if (modelClass.prototype.columnMappings) {
            mappings = modelClass.prototype.columnMappings;
        }
        const currentClass = Object.getPrototypeOf(modelClass);
        if (currentClass.prototype.columnMappings) {
            mappings = { ...currentClass.prototype.columnMappings, ...mappings };
        }
    
        return mappings;
    }

    /**
     * Get property name by column name
     * @param column Column name
     * @param mapping Column-propery mapping of model
     * @returns Property name
     */
    public static getPropertyByColumnName(column: string, mapping: Record<string, string>): string {
        const propertyName = Object.keys(mapping).find(key => mapping[key] === column);
        if (!propertyName) {
            throw new Error("Error while getting column metadata.");
        }
        return propertyName;
    }

    /**
     * Get column name by property name
     * @param property Property name
     * @param mapping Column-propery mapping of model
     * @returns Column name
     */
    public static getColumnNameByProperty(property: string, mapping: Record<string, string>): string {
        const columnName = mapping[property];
        if (!columnName) {
            throw new Error("Error while getting column metadata.");
        }
        return columnName;
    }
}
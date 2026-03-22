/**
 * TestDataService — Generates typed mock data factories for Appium test data.
 * Creates TypeScript interfaces + faker.js factory functions for reusable test data.
 */
export class TestDataService {

  /**
   * Generates a prompt instructing the LLM to create a typed mock data factory
   * using @faker-js/faker for the given entity.
   */
  public generateDataFactoryPrompt(entityName: string, schemaDefinition: string): string {
    return `
You are an expert TypeScript developer specializing in mobile test automation data.
Your task is to generate a reusable Mock Data Factory for the specified entity using \`@faker-js/faker\`.

### 🎯 TARGET ENTITY
Entity Name: ${entityName}
Schema / Requirements:
\`\`\`
${schemaDefinition}
\`\`\`

### 🛑 CRITICAL INSTRUCTIONS

1. **TypeScript Interface**:
   - Define a strict TypeScript \`interface\` for \`${entityName}\` based on the schema.
   - Mark optional fields with \`?\`.

2. **Faker.js Factory Function**:
   - Write a \`build${entityName}(overrides?: Partial<${entityName}>): ${entityName}\` function.
   - Use \`import { faker } from '@faker-js/faker';\` for realistic default data.
   - Merge the \`overrides\` parameter so tests can customize specific fields.

3. **Array Builder**:
   - Also export a \`build${entityName}List(count: number, overrides?: Partial<${entityName}>): ${entityName}[]\` function.
   - Uses the factory in a loop.

4. **Test-Friendly Exports**:
   - Export the interface, factory, and list builder.
   - File should be placed in \`test-data/${entityName.toLowerCase()}.factory.ts\`.

5. **Output Format**:
   - Return ONLY the raw TypeScript code. NO explanations.
`;
  }
}

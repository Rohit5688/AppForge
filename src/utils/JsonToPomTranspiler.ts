export interface JsonPageObject {
  className: string;
  path: string;
  extendsClass?: string;
  imports?: string[];
  locators?: { name: string; selector: string; isArray?: boolean }[];
  methods?: { name: string; isAsync?: boolean; args?: string[]; body: string[] }[];
}

export class JsonToPomTranspiler {
  /**
   * Transpiles a JSON representation of a Page Object into a fully formatted TypeScript string.
   */
  public static transpile(pom: JsonPageObject): string {
    const lines: string[] = [];

    // 1. Imports
    if (pom.imports && pom.imports.length > 0) {
      lines.push(...pom.imports);
      lines.push('');
    } else {
      lines.push("import { $ } from '@wdio/globals';");
      lines.push('');
    }

    // 2. Class Declaration
    const extendsClause = pom.extendsClass ? ` extends ${pom.extendsClass}` : '';
    lines.push(`export class ${pom.className}${extendsClause} {`);

    // 3. Properties / Locators (For Appium/WebdriverIO)
    if (pom.locators && pom.locators.length > 0) {
      for (const loc of pom.locators) {
        // Appium typically uses getter functions for $ commands
        // get myEle() { return $('~foo'); }
        lines.push(`  public get ${loc.name}() {`);
        if (loc.isArray) {
            lines.push(`    return $$('${loc.selector.replace(/'/g, "\\'")}');`);
        } else {
            lines.push(`    return $('${loc.selector.replace(/'/g, "\\'")}');`);
        }
        lines.push(`  }`);
      }
      lines.push('');
    }

    // 4. Methods
    if (pom.methods) {
      for (const method of pom.methods) {
        const asyncKeyword = method.isAsync !== false && method.name !== 'constructor' ? 'async ' : '';
        const args = method.args ? method.args.join(', ') : '';
        lines.push(`  public ${asyncKeyword}${method.name}(${args}) {`);
        if (method.body) {
          for (const statement of method.body) {
            lines.push(`    ${statement}`);
          }
        }
        lines.push(`  }`);
        lines.push('');
      }
    }

    lines.push(`}`);
    // WebdriverIO conventions usually export an instance, or just the class definition. We'll leave it as class exported.
    return lines.join('\\n');
  }
}

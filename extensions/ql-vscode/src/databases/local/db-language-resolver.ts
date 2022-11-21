import { CodeQLCliServer } from "../../cli";

export class DbLanguageResolver {
  constructor(private readonly cli: CodeQLCliServer) {}

  public async resolvePrimaryLanguage(
    dbPath: string,
  ): Promise<string | undefined> {
    if (!(await this.cli.cliConstraints.supportsLanguageName())) {
      // return undefined so that we recalculate on restart until the cli is at a version that
      // supports this feature. This recalculation is cheap since we avoid calling into the cli
      // unless we know it can return the langauges property.
      return undefined;
    }
    const dbInfo = await this.cli.resolveDatabase(dbPath);
    return dbInfo.languages?.[0] || "";
  }
}

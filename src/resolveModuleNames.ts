import * as ts from 'typescript';

function loadWithLocalCache<T>(
  names: string[],
  containingFile: string,
  loader: (name: string, containingFile: string) => T
): T[] {
  if (names.length === 0) {
    return [];
  }
  const resolutions: T[] = [];
  const cache = new Map<string, T>();
  for (const name of names) {
    let result: T;
    if (cache.has(name)) {
      result = cache.get(name)!;
    } else {
      cache.set(name, (result = loader(name, containingFile)));
    }
    resolutions.push(result);
  }
  return resolutions;
}

interface IndexedObject<T> {
  [key: string]: T;
}

function getFromCacheOrCompute<T>(
  cache: IndexedObject<T>,
  key: string,
  compute: (key: string) => T
): T {
  const cachedVal = cache[key];
  if (cachedVal !== undefined) {
    return cachedVal;
  }
  const computedVal = compute(key);
  cache[key] = computedVal;
  return computedVal;
}

function createResolver(
  host: ts.CompilerHost,
  compilerOptions: ts.CompilerOptions
) {
  const moduleResolutionCache = ts.createModuleResolutionCache(
    host.getCurrentDirectory(),
    x => host.getCanonicalFileName(x)
  );

  const loader = (moduleName: string, containingFile: string) =>
    ts.resolveModuleName(
      moduleName,
      containingFile,
      compilerOptions,
      host,
      moduleResolutionCache
    ).resolvedModule!; // TODO: GH#18217

  return (moduleNames: string[], containingFile: string) =>
    loadWithLocalCache<ts.ResolvedModuleFull>(
      moduleNames,
      containingFile,
      loader
    );
}

function getOptionsFromConfigPath(confPath: string) {
  return ts.getParsedCommandLineOfConfigFile(confPath, {}, ts.sys as any)!
    .options;
}

export function getResolveModuleNames(
  projectConfigPath: string,
  host: ts.CompilerHost = ts.createCompilerHost(
    getOptionsFromConfigPath(projectConfigPath)
  )
) {
  const tsConfigCache = {};

  const cachedFileExists = (filename: string) =>
    getFromCacheOrCompute(tsConfigCache, filename, ts.sys.fileExists);

  const resolversCache = {};

  return (
    moduleNames: string[],
    containingFile: string
    // reusedNames?: string[],
  ) => {
    const tsConf =
      ts.findConfigFile(containingFile, cachedFileExists) || projectConfigPath;

    const resolver = getFromCacheOrCompute(resolversCache, tsConf, () => {
      const localOptions = getOptionsFromConfigPath(tsConf);
      return createResolver(host, localOptions);
    });

    return resolver(moduleNames, containingFile);
  };
}

type IpcArgs = Record<string, any> | undefined;

const pickArg = (args: IpcArgs, ...names: string[]) => {
  for (const name of names) {
    const value = args?.[name];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
};

export const requireStringArg = (
  command: string,
  args: IpcArgs,
  ...names: string[]
) => {
  const value = pickArg(args, ...names);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${command} requires ${names.join(" or ")}.`);
  }
  return value;
};

export const optionalStringArg = (args: IpcArgs, ...names: string[]) => {
  const value = pickArg(args, ...names);
  return typeof value === "string" && value.trim().length > 0
    ? value
    : null;
};


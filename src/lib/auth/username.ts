export const usernamePattern = "[A-Za-z0-9_\\-]{3,24}";

export function isValidUsername(username: string) {
  return (
    username.length >= 3 &&
    username.length <= 24 &&
    [...username].every(
      (character) =>
        (character >= "A" && character <= "Z") ||
        (character >= "a" && character <= "z") ||
        (character >= "0" && character <= "9") ||
        character === "_" ||
        character === "-",
    )
  );
}

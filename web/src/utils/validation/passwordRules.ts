export type PasswordRule =
  | { type: 'min'; value: number; message: string }
  | { type: 'regex'; value: RegExp; message: string };

export const PASSWORD_RULES: PasswordRule[] = [
  {
    type: 'min',
    value: 8,
    message: '8 characters',
  },
  {
    type: 'regex',
    value: /[a-z]/,
    message: '1 lowercase letter',
  },
  {
    type: 'regex',
    value: /[A-Z]/,
    message: '1 uppercase letter',
  },
  {
    type: 'regex',
    value: /\d/,
    message: '1 number',
  },
  {
    type: 'regex',
    value: /[^A-Za-z0-9\s]/,
    message: '1 special character (e.g., %, &, $, !, @)',
  },
  {
    type: 'regex',
    value: /^\S*$/,
    message: 'No whitespace allowed',
  },
];

export function validatePasswordRule(rule: PasswordRule, password: string | undefined): boolean {
  if (!password) {
    return false;
  }

  switch (rule.type) {
    case 'min':
      return password.length >= rule.value;
    case 'regex':
      return rule.value.test(password);
    default:
      return false;
  }
}

import { GraphQLError, GraphQLScalarType, Kind, type ValueNode } from 'graphql';

function invalid(scalar: string, detail: string): never {
  throw new GraphQLError(`${scalar} inválido: ${detail}`, { extensions: { code: 'BAD_USER_INPUT' } });
}

function literalValue(ast: ValueNode): unknown {
  switch (ast.kind) {
    case Kind.STRING:
      return ast.value;
    case Kind.INT:
      return Number.parseInt(ast.value, 10);
    case Kind.FLOAT:
      return Number.parseFloat(ast.value);
    default:
      return undefined;
  }
}

function parseDateTime(value: unknown): Date {
  const date = new Date(String(value));
  if (typeof value !== 'string' || Number.isNaN(date.getTime())) invalid('DateTime', String(value));
  return date;
}

export const DateTime = new GraphQLScalarType<Date, string>({
  name: 'DateTime',
  description: 'Instante ISO-8601 con zona horaria.',
  serialize(value) {
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) invalid('DateTime', String(value));
    return date.toISOString();
  },
  parseValue: parseDateTime,
  parseLiteral: (ast) => parseDateTime(literalValue(ast)),
});

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(value: unknown): string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) invalid('Date', `${String(value)} (se espera YYYY-MM-DD)`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) invalid('Date', value);
  return value;
}

export const DateScalar = new GraphQLScalarType<string, string>({
  name: 'Date',
  description: 'Fecha de calendario YYYY-MM-DD.',
  serialize(value) {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  },
  parseValue: parseDate,
  parseLiteral: (ast) => parseDate(literalValue(ast)),
});

function parseMoney(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) invalid('Money', String(value));
  if (Math.round(value * 100) !== value * 100) invalid('Money', 'máximo 2 decimales');
  return value;
}

export const Money = new GraphQLScalarType<number, number>({
  name: 'Money',
  description: 'Valor monetario COP con 2 decimales.',
  serialize(value) {
    const amount = typeof value === 'number' ? value : Number.parseFloat(String(value));
    if (!Number.isFinite(amount)) invalid('Money', String(value));
    return Math.round(amount * 100) / 100;
  },
  parseValue: parseMoney,
  parseLiteral: (ast) => parseMoney(literalValue(ast)),
});

function parsePositiveInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    invalid('PositiveInt', `${String(value)} (debe ser un entero mayor que 0)`);
  }
  if (value > 2_147_483_647) invalid('PositiveInt', 'fuera de rango');
  return value;
}

export const PositiveInt = new GraphQLScalarType<number, number>({
  name: 'PositiveInt',
  description: 'Entero > 0.',
  serialize(value) {
    return Number(value);
  },
  parseValue: parsePositiveInt,
  parseLiteral(ast) {
    if (ast.kind !== Kind.INT) invalid('PositiveInt', 'se esperaba un entero');
    return parsePositiveInt(Number.parseInt(ast.value, 10));
  },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function parseEmail(value: unknown): string {
  if (typeof value !== 'string' || value.length > 254 || !EMAIL_RE.test(value.trim())) {
    invalid('Email', String(value));
  }
  return value.trim().toLowerCase();
}

export const Email = new GraphQLScalarType<string, string>({
  name: 'Email',
  description: 'Correo electrónico normalizado en minúsculas.',
  serialize(value) {
    return String(value);
  },
  parseValue: parseEmail,
  parseLiteral: (ast) => parseEmail(literalValue(ast)),
});

export const scalarResolvers = {
  DateTime,
  Date: DateScalar,
  Money,
  PositiveInt,
  Email,
};

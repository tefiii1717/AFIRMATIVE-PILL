import type { UserErrorData } from '@/graphql/types';

/** Muestra los errores de negocio tipados (interfaz UserError) de un payload. */
export function ErrorList({ errors }: { errors: UserErrorData[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="alert alert-error" role="alert">
      <ul>
        {errors.map((error, index) => (
          <li key={`${error.code}-${index}`}>
            <strong>{error.message}</strong>
            {error.__typename === 'InsufficientStockError' && (
              <span className="muted">
                {' '}
                (solicitado: {error.requested}, disponible: {error.available})
              </span>
            )}
            {error.__typename === 'PrescriptionRequiredError' && error.medications?.length ? (
              <span className="muted"> — completa el formulario de fórmula médica más abajo.</span>
            ) : null}
            <code className="error-code">{error.code}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

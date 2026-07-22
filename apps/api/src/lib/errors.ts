// Brand globali (Symbol.for → registro condiviso tra eventuali copie duplicate del modulo). Rendono
// `instanceof` affidabile anche quando il bundler/test runner carica questo modulo più volte (es.
// vitest su Windows): il controllo guarda il brand sul prototipo invece dell'identità della classe.
const NOT_FOUND_BRAND = Symbol.for('animeunion.error.NotFoundError');
const PRECONDITION_BRAND = Symbol.for('animeunion.error.PreconditionError');

function brandInstanceOf(brand: symbol) {
  return (instance: unknown): boolean =>
    typeof instance === 'object' &&
    instance !== null &&
    (instance as Record<PropertyKey, unknown>)[brand] === true;
}

/** Risorsa inesistente (es. anime/episodio non trovato). */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}
(NotFoundError.prototype as unknown as Record<PropertyKey, unknown>)[NOT_FOUND_BRAND] = true;
Object.defineProperty(NotFoundError, Symbol.hasInstance, {
  value: brandInstanceOf(NOT_FOUND_BRAND),
});

/** Operazione non valida nello stato attuale (es. download senza cartelle configurate). */
export class PreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PreconditionError';
  }
}
(PreconditionError.prototype as unknown as Record<PropertyKey, unknown>)[PRECONDITION_BRAND] = true;
Object.defineProperty(PreconditionError, Symbol.hasInstance, {
  value: brandInstanceOf(PRECONDITION_BRAND),
});

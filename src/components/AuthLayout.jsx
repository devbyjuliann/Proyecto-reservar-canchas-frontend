export function AuthLayout({ children }) {
  return <div className="auth-layout">
    <section className="auth-intro">
      <div className="court-corner" aria-hidden="true"><span /><span /><span /></div>
      <h1>Tu cancha,<br />en el horario exacto.</h1>
      <p>La disponibilidad se comprueba de nuevo al confirmar. Lo que reservas es un turno real, no una promesa.</p>
    </section>
    <section className="auth-form-wrap" aria-labelledby="auth-title">{children}</section>
  </div>;
}

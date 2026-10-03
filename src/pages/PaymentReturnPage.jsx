import { Link, useSearchParams } from 'react-router-dom';

import { PageHeading } from '../components/Primitives.jsx';

export function PaymentReturnPage() {
  const [search] = useSearchParams();
  const transactionId = search.get('id');
  return <div className="page-standard">
    <PageHeading title="Estamos verificando tu pago" description="Wompi notificará al servidor y la Reserva se confirmará solo después de esa verificación." />
    <p className="notice notice-info">{transactionId ? 'Recibimos el identificador de la transacción para mostrar este estado, pero no confiamos en él para acreditar el pago.' : 'Consulta tus Reservas mientras el servidor verifica el resultado.'}</p>
    <Link className="button button-primary" to="/reservas">Ver mis Reservas</Link>
  </div>;
}

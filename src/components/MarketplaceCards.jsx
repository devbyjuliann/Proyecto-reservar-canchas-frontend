import { ArrowUpRight, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

import { formatCOP, sportLabel } from '../lib/format.js';

function CourtIllustration({ sport }) {
  return (
    <div className={`listing-illustration ${sport ? 'is-court' : ''}`} aria-hidden="true">
      <span className="listing-field"><i /><i /><i /></span>
      <span className="listing-sport">{sport ? 'Cancha' : 'Reserva Canchas'}</span>
    </div>
  );
}

export function FacilityCard({ facility }) {
  return (
    <Link className="listing-card listing-card-facility" to={`/instalaciones/${facility.id}`} aria-label={`Ver establecimiento ${facility.name}`}>
      <CourtIllustration />
      <div className="listing-content">
        <span className="listing-location"><MapPin size={16} aria-hidden="true" />{facility.city}</span>
        <div className="listing-title-row"><h3>{facility.name}</h3></div>
        <p>{facility.description}</p>
        <div className="listing-footer">
          <span>{facility.visibleCourtCount} {facility.visibleCourtCount === 1 ? 'cancha' : 'canchas'}</span>
          {facility.fromPriceMinor != null ? <strong>Desde {formatCOP(facility.fromPriceMinor)}</strong> : <span>Precio por consultar</span>}
        </div>
        <span className="listing-card-action">Ver canchas <ArrowUpRight size={16} aria-hidden="true" /></span>
      </div>
    </Link>
  );
}

export function CourtCard({ court }) {
  return (
    <Link className="listing-card listing-card-court" to={`/canchas/${court.id}`} aria-label={`Ver cancha ${court.name} de ${court.facility.name}`}>
      <CourtIllustration sport={court.sportCode} />
      <div className="listing-content">
        <span className="listing-location"><MapPin size={16} aria-hidden="true" />{court.facility.name} · {court.facility.city}</span>
        <div className="listing-title-row"><h3>{court.name}</h3></div>
        <span className="listing-court-sport">{sportLabel(court.sportCode)}</span>
        <p>{court.description}</p>
        <div className="listing-footer"><span>Precio orientativo</span>{court.fromPriceMinor != null ? <strong>Desde {formatCOP(court.fromPriceMinor)}</strong> : <span>Precio por consultar</span>}</div>
        <span className="listing-card-action">Ver disponibilidad <ArrowUpRight size={16} aria-hidden="true" /></span>
      </div>
    </Link>
  );
}

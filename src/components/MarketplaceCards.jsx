import { ArrowUpRight, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

import { formatCOP, sportLabel } from '../lib/format.js';

function CourtIllustration({ sport }) {
  return (
    <div className={`listing-illustration ${sport ? 'is-court' : ''}`} aria-hidden="true">
      <span className="listing-field"><i /><i /><i /></span>
      <span className="listing-sport">{sport ? sportLabel(sport) : 'Reserva Canchas'}</span>
    </div>
  );
}

export function FacilityCard({ facility }) {
  return (
    <Link className="listing-card" to={`/instalaciones/${facility.id}`} aria-label={`Ver establecimiento ${facility.name}`}>
      <CourtIllustration />
      <div className="listing-content">
        <span className="listing-location"><MapPin size={16} aria-hidden="true" />{facility.city}</span>
        <div className="listing-title-row"><h3>{facility.name}</h3><ArrowUpRight size={21} aria-hidden="true" /></div>
        <p>{facility.description}</p>
        <div className="listing-footer">
          <span>{facility.visibleCourtCount} {facility.visibleCourtCount === 1 ? 'cancha' : 'canchas'}</span>
          <strong>Desde {formatCOP(facility.fromPriceMinor)}</strong>
        </div>
      </div>
    </Link>
  );
}

export function CourtCard({ court }) {
  return (
    <Link className="listing-card" to={`/canchas/${court.id}`} aria-label={`Ver cancha ${court.name} de ${court.facility.name}`}>
      <CourtIllustration sport={court.sportCode} />
      <div className="listing-content">
        <span className="listing-location"><MapPin size={16} aria-hidden="true" />{court.facility.name} · {court.facility.city}</span>
        <div className="listing-title-row"><h3>{court.name}</h3><ArrowUpRight size={21} aria-hidden="true" /></div>
        <p>{court.description}</p>
        <div className="listing-footer"><span>{sportLabel(court.sportCode)}</span><strong>Desde {formatCOP(court.fromPriceMinor)}</strong></div>
      </div>
    </Link>
  );
}

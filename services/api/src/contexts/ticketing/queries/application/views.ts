import { ShowId } from "@open-ticket/contracts";
import type { AvailabilityView, SeatMapView } from "@open-ticket/contracts";

import { tokenOf } from "../../shared/application/index.ts";
import type { Clock } from "../../shared/application/index.ts";
import { availabilityAsOf, seatMapAsOf } from "../domain/index.ts";
import type { Projector } from "./projector.ts";

/**
 * Shared read-model view builders — one place that turns projector state + the injected clock
 * (D2-04 lazy expiry, never `Date.now()`) into a contract DTO with `asOf`. Both the `GET` read
 * routes and the SSE seat stream reuse these so the view shape is never duplicated. Callers must
 * ensure the show is projected (`getSeatMap` defined) before building.
 */
export function buildSeatMapView(projector: Projector, clock: Clock, showId: string): SeatMapView {
  const state = projector.getSeatMap(showId) ?? { seats: new Map() };
  return {
    showId: ShowId.parse(showId),
    asOf: tokenOf(projector.asOf()),
    seats: [...seatMapAsOf(state, clock.now())],
  };
}

export function buildAvailabilityView(
  projector: Projector,
  clock: Clock,
  showId: string,
): AvailabilityView {
  const state = projector.getSeatMap(showId) ?? { seats: new Map() };
  return {
    showId: ShowId.parse(showId),
    asOf: tokenOf(projector.asOf()),
    ...availabilityAsOf(state, clock.now()),
  };
}

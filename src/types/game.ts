export type LocationRecord = {
  zip: string;
  city: string;
  state: string;
  metro: string;
  county: string;
  lat: number;
  lng: number;
  homeValue: number;
};

export type LocationView = Omit<LocationRecord, 'homeValue'> & {
  zhviLabel: string;
};

export type RoundHandle = {
  id: string;
  location: LocationRecord;
  createdAt: number;
  heading: number;
};

export type RoundPayload = {
  roundId: string;
  location: LocationView;
  heading: number;
};

export type GuessRequest = {
  roundId: string;
  guess: number;
};

export type GuessResult = {
  roundId: string;
  actualValue: number;
  formattedActual: string;
  guess: number;
  formattedGuess: string;
  score: number;
  percentageError: number;
  difference: number;
  city: string;
  state: string;
  zip: string;
};

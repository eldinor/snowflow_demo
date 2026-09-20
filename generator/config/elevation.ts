/** Art-direction controls for the first generated 2 km terrain layout. */
export const ELEVATION_CONFIG = Object.freeze({
    seaLevel: 0,
    baseHeight: 34,
    maximumExpectedHeight: 520,
    derivativeStep: 2,
    mountainChain: {
        centreZ: 340,
        xSlope: 0.18,
        halfWidth: 390,
        height: 350,
    },
    westernRidge: {
        centreX: -610,
        halfWidth: 230,
        height: 165,
    },
    desertBasin: {
        centreX: 430,
        centreZ: -470,
        radius: 650,
        depth: 44,
    },
});

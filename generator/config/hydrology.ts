/** Art-direction limits for open water in the initial 2 km world. */
export const HYDROLOGY_CONFIG = Object.freeze({
    minimumLakeDepth: 0.25,
    minimumLakeCells: 8,
    maximumLakes: 3,
    primaryRivers: 1,
    // The current seed's small southern river intersects the shared road trunk.
    // Roads take precedence, so only the non-intersecting primary river remains.
    smallRivers: 0,
    primaryRiverWidthCells: 4,
    smallRiverWidthCells: 2,
    primaryCarveRadiusCells: 6,
    smallCarveRadiusCells: 3,
    primaryCarveDepth: 2.4,
    smallCarveDepth: 0.9,
    minimumRiverCells: 36,
    maximumSmallRiverCells: 320,
    minimumRiverSourceSeparationCells: 90,
    waterfallWindowCells: 5,
    waterfallMinimumDrop: 5.5,
    waterfallSeparationCells: 30,
    maximumWaterfalls: 2,
});

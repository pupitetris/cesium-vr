const VAR = {
    bingKey: "get-yours-at-https://www.bingmapsportal.com/",
    // Globally default CesiumIon key, will generate a warning:
    cesiumKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJmYmE2YWEzOS1lZDUyLTQ0YWMtOTlkNS0wN2VhZWI3NTc4MmEiLCJpZCI6MjU5LCJpYXQiOjE2ODU2MzQ0Njl9.AswCMxsN03WYwuZL-r183OZicN64Ks9aPExWhA3fuLY"
};

Object.keys(VAR).forEach(key => {
    Object.defineProperty(VAR, key, { value: VAR[key], enumerable: true, writable: false, configurable: false });
});

export default VAR;


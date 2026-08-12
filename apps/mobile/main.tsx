import { enableScreens } from "react-native-screens";

// Explicitly enable native screen optimizations. native-stack enables this
// by default, but the explicit call documents the requirement and ensures
// it runs before any navigator mounts.
enableScreens(true);

export { default } from "./src/App";

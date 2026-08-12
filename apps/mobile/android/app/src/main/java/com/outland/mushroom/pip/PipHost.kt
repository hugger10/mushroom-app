package com.outland.mushroom.pip

/**
 * Contract implemented by [com.outland.mushroom.MainActivity] so the PiP native
 * module can drive auto-enter behaviour without holding a hard reference to the
 * concrete activity type.
 */
interface PipHost {
  /**
   * Remember whether PiP should be entered automatically when the user leaves
   * the activity (Home key). [width]/[height] define the PiP aspect ratio.
   */
  fun setPipAutoEnter(enabled: Boolean, width: Int, height: Int)
}

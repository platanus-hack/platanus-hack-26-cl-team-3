package expo.modules.capoar

import com.google.ar.core.Pose

/** Preserve a camera pose across ARCore world-coordinate corrections during image analysis. */
internal class CapturePose(referenceAtCapture: Pose, cameraAtCapture: Pose) {
  val cameraInReference = referenceAtCapture.inverse().compose(cameraAtCapture)

  fun inCurrentWorld(referenceNow: Pose): Pose = referenceNow.compose(cameraInReference)
}

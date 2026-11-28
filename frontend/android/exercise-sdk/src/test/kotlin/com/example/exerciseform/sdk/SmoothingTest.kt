package com.example.exerciseform.sdk
import com.example.exerciseform.sdk.api.*
import com.example.exerciseform.sdk.smoothing.*
import org.junit.Assert.assertTrue
import org.junit.Test
class SmoothingTest { @Test fun emaReducesJump(){val s=EmaSmoother(.5f);val f={x:Float->PoseFrame(1,listOf(PoseLandmark(0,x,0f,0f,1f,1f)),1,1)};s.smooth(f(0f),.5f);assertTrue(s.smooth(f(1f),.5f).landmarks[0].x<1f)} }

package com.jhony.sfp;

import static org.junit.Assert.assertTrue;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.Until;

import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class MainActivityUiTest {
    @Test
    public void launchesWebViewWithoutChangingProductionPackage() throws Exception {
        UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        device.pressHome();
        device.executeShellCommand("am start -W com.jhony.sfp.debug/com.jhony.sfp.MainActivity");
        assertTrue(device.wait(Until.hasObject(By.pkg("com.jhony.sfp.debug").depth(0)), 10_000));
    }
}

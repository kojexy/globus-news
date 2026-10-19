package online.globus.news;

import android.app.Instrumentation;
import android.content.Intent;
import android.os.ParcelFileDescriptor;
import android.view.KeyEvent;
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.FileInputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import static org.junit.Assert.*;

public class ReaderTest {
    private Instrumentation instrumentation;
    private MainActivity activity;
    private WebView reader;
    private String evaluate(String script) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> reader.evaluateJavascript(script, value -> { result.set(value); latch.countDown(); }));
        assertTrue("WebView script timed out", latch.await(10,TimeUnit.SECONDS));
        return result.get();
    }
    private void screenshot(String name) throws Exception {
        try (ParcelFileDescriptor descriptor = instrumentation.getUiAutomation().executeShellCommand("screencap -p /sdcard/Download/globus-" + name + ".png");
             FileInputStream input = new FileInputStream(descriptor.getFileDescriptor())) {
            byte[] buffer = new byte[4096];
            while (input.read(buffer) != -1) { }
        }
    }
    @Test public void releaseReaderRespondsToTvRemote() throws Exception {
        instrumentation = InstrumentationRegistry.getInstrumentation();
        Intent launch = new Intent(instrumentation.getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity = (MainActivity)instrumentation.startActivitySync(launch);
        instrumentation.runOnMainSync(() -> reader = (WebView)((FrameLayout)activity.findViewById(android.R.id.content)).getChildAt(0));
        boolean ready = false;
        for (int i=0;i<45;i++) {
            if ("true".equals(evaluate("Boolean(document.querySelector('#position') && document.querySelector('#position').textContent.includes('/'))"))) { ready=true;break; }
            Thread.sleep(1000);
        }
        assertTrue("No news loaded in release WebView",ready);
        screenshot("01-reader");
        String first = evaluate("document.querySelector('#headline').textContent");
        assertEquals("Body must fit the viewport","true",evaluate("document.querySelector('#storyText').scrollHeight <= document.querySelector('#textSpace').clientHeight+2"));
        instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_DPAD_RIGHT);Thread.sleep(500);
        assertNotEquals("D-pad right must change the article",first,evaluate("document.querySelector('#headline').textContent"));
        screenshot("02-next-news");
        instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_DPAD_CENTER);Thread.sleep(300);
        assertEquals("OK opens countries","false",evaluate("document.querySelector('#countriesDialog').hidden"));
        screenshot("03-countries");
        instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);Thread.sleep(300);
        assertEquals("Back closes countries","true",evaluate("document.querySelector('#countriesDialog').hidden"));
        instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_MENU);Thread.sleep(300);
        assertEquals("Menu opens settings","false",evaluate("document.querySelector('#settingsDialog').hidden"));
        screenshot("04-settings");
        instrumentation.runOnMainSync(() -> activity.finish());
    }
}

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
        CountDownLatch latch=new CountDownLatch(1);
        AtomicReference<String> result=new AtomicReference<>();
        instrumentation.runOnMainSync(()->reader.evaluateJavascript(script,value->{result.set(value);latch.countDown();}));
        assertTrue("WebView script timed out",latch.await(10,TimeUnit.SECONDS));
        return result.get();
    }
    private void key(int code) throws Exception {instrumentation.sendKeyDownUpSync(code);Thread.sleep(180);}
    private void screenshot(String name) throws Exception {
        ParcelFileDescriptor descriptor=instrumentation.getUiAutomation().executeShellCommand("screencap -p /sdcard/Download/globus-"+name+".png");
        try (ParcelFileDescriptor.AutoCloseInputStream input=new ParcelFileDescriptor.AutoCloseInputStream(descriptor)) {byte[] bytes=new byte[4096];while(input.read(bytes)!=-1){}}
    }
    @Test public void releaseReaderRespondsToTvRemote() throws Exception {
        instrumentation=InstrumentationRegistry.getInstrumentation();
        activity=(MainActivity)instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        instrumentation.runOnMainSync(()->reader=(WebView)((FrameLayout)activity.findViewById(android.R.id.content)).getChildAt(0));
        boolean ready=false;
        for(int i=0;i<45;i++){if("true".equals(evaluate("Boolean(document.querySelector('#position') && document.querySelector('#position').textContent.includes('/'))"))){ready=true;break;}Thread.sleep(1000);}
        assertTrue("No news in release WebView",ready);
        assertTrue("Renamed brand missing",evaluate("document.title").contains("Новости с Луны"));
        screenshot("01-reader");
        String first=evaluate("document.querySelector('#headline').textContent");
        key(KeyEvent.KEYCODE_DPAD_RIGHT);
        assertNotEquals("Right changes news",first,evaluate("document.querySelector('#headline').textContent"));
        screenshot("02-next-news");
        key(KeyEvent.KEYCODE_DPAD_CENTER);
        assertEquals("OK enters article reader","\"reading\"",evaluate("document.body.dataset.mode"));
        assertEquals("Article text fits","true",evaluate("document.querySelector('#storyText').scrollHeight<=document.querySelector('#textSpace').clientHeight+2"));
        screenshot("03-article");
        key(KeyEvent.KEYCODE_BACK);
        assertEquals("Back returns to news","\"overview\"",evaluate("document.body.dataset.mode"));
        key(KeyEvent.KEYCODE_DPAD_UP);
        assertEquals("Up opens menu","false",evaluate("document.querySelector('#quickDialog').hidden"));
        key(KeyEvent.KEYCODE_DPAD_DOWN);
        key(KeyEvent.KEYCODE_DPAD_CENTER);
        assertEquals("Country filter reachable via remote","false",evaluate("document.querySelector('#countriesDialog').hidden"));
        screenshot("04-countries");
        key(KeyEvent.KEYCODE_BACK);
        key(KeyEvent.KEYCODE_MENU);
        key(KeyEvent.KEYCODE_DPAD_DOWN);
        key(KeyEvent.KEYCODE_DPAD_DOWN);
        key(KeyEvent.KEYCODE_DPAD_CENTER);
        assertEquals("Settings reachable via remote","false",evaluate("document.querySelector('#settingsDialog').hidden"));
        evaluate("document.querySelector('#fontScale').focus()");
        String old=evaluate("document.querySelector('#fontScale').value");
        key(KeyEvent.KEYCODE_DPAD_RIGHT);
        assertNotEquals("Right adjusts slider",old,evaluate("document.querySelector('#fontScale').value"));
        screenshot("05-settings");
        key(KeyEvent.KEYCODE_BACK);
        assertEquals("Back closes settings","true",evaluate("document.querySelector('#settingsDialog').hidden"));
        instrumentation.runOnMainSync(()->activity.finish());
    }
}

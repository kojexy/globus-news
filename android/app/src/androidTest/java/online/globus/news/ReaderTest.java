package online.globus.news;

import android.app.Instrumentation;
import android.content.Intent;
import android.os.ParcelFileDescriptor;
import android.view.KeyEvent;
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.test.platform.app.InstrumentationRegistry;
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
        CountDownLatch latch=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();
        instrumentation.runOnMainSync(()->reader.evaluateJavascript(script,result->{value.set(result);latch.countDown();}));
        assertTrue("WebView script timed out",latch.await(10,TimeUnit.SECONDS));return value.get();
    }
    private void waitFor(String script) throws Exception {
        for(int i=0;i<100;i++){if("true".equals(evaluate(script)))return;Thread.sleep(200);}
        fail("Condition failed: "+script);
    }
    private void key(int code) throws Exception {instrumentation.sendKeyDownUpSync(code);Thread.sleep(300);}
    private void screenshot(String name) throws Exception {
        instrumentation.runOnMainSync(()->{reader.invalidate();reader.postInvalidateOnAnimation();});Thread.sleep(800);
        ParcelFileDescriptor descriptor=instrumentation.getUiAutomation().executeShellCommand("screencap -p /sdcard/Download/globus-"+name+".png");
        try(ParcelFileDescriptor.AutoCloseInputStream stream=new ParcelFileDescriptor.AutoCloseInputStream(descriptor)){byte[] bytes=new byte[4096];while(stream.read(bytes)!=-1){}}
    }
    @Test public void releaseReaderRespondsToTvRemote() throws Exception {
        instrumentation=InstrumentationRegistry.getInstrumentation();activity=(MainActivity)instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        instrumentation.runOnMainSync(()->reader=(WebView)((FrameLayout)activity.findViewById(android.R.id.content)).getChildAt(0));
        waitFor("Boolean(document.querySelector('#reader') && document.querySelector('#reader').dataset.ready==='true')");
        assertEquals("No read-button, sidebar or toolbar","true",evaluate("!document.querySelector('#readButton,.source-panel,.masthead,.footer')"));
        assertEquals("Two newspaper columns","2",evaluate("document.querySelectorAll('.paper-column').length"));
        assertEquals("Full text shown immediately","true",evaluate("document.querySelector('#leftText').textContent.length>0"));
        screenshot("01-reader");
        String before=evaluate("document.querySelector('#reader').dataset.newsId");
        key(KeyEvent.KEYCODE_DPAD_RIGHT);waitFor("document.querySelector('#reader').dataset.ready==='true'");
        assertNotEquals("Right always changes news",before,evaluate("document.querySelector('#reader').dataset.newsId"));
        assertEquals("New article starts at first page","\"0\"",evaluate("document.querySelector('#textSpace').dataset.pageIndex"));
        screenshot("02-next-news");
        for(int i=0;i<72;i++){
            if("true".equals(evaluate("Number(document.querySelector('#textSpace').dataset.pageCount)>1")))break;
            key(KeyEvent.KEYCODE_DPAD_RIGHT);waitFor("document.querySelector('#reader').dataset.ready==='true'");
        }
        assertEquals("Long articles are present","true",evaluate("Number(document.querySelector('#textSpace').dataset.pageCount)>1"));
        String same=evaluate("document.querySelector('#reader').dataset.newsId");
        key(KeyEvent.KEYCODE_DPAD_DOWN);
        assertEquals("Down continues the same news",same,evaluate("document.querySelector('#reader').dataset.newsId"));
        assertEquals("Down opens the next page","\"1\"",evaluate("document.querySelector('#textSpace').dataset.pageIndex"));
        screenshot("03-article");
        key(KeyEvent.KEYCODE_DPAD_UP);assertEquals("Up returns to previous page","\"0\"",evaluate("document.querySelector('#textSpace').dataset.pageIndex"));
        key(KeyEvent.KEYCODE_DPAD_CENTER);assertEquals("OK only opens menu","false",evaluate("document.querySelector('#quickDialog').hidden"));
        key(KeyEvent.KEYCODE_DPAD_DOWN);key(KeyEvent.KEYCODE_DPAD_CENTER);
        assertEquals("Countries reachable by remote","false",evaluate("document.querySelector('#countriesDialog').hidden"));screenshot("04-countries");
        key(KeyEvent.KEYCODE_BACK);key(KeyEvent.KEYCODE_MENU);key(KeyEvent.KEYCODE_DPAD_DOWN);key(KeyEvent.KEYCODE_DPAD_DOWN);key(KeyEvent.KEYCODE_DPAD_CENTER);
        assertEquals("Settings reachable by remote","false",evaluate("document.querySelector('#settingsDialog').hidden"));
        evaluate("document.querySelector('#fontScale').focus()");String scale=evaluate("document.querySelector('#fontScale').value");key(KeyEvent.KEYCODE_DPAD_LEFT);assertNotEquals("Scale is adjustable",scale,evaluate("document.querySelector('#fontScale').value"));screenshot("05-settings");
        key(KeyEvent.KEYCODE_BACK);waitFor("document.querySelector('#reader').dataset.ready==='true'");
        assertEquals("Both text columns fit","true",evaluate("document.querySelector('#leftText').scrollHeight<=document.querySelector('#leftText').clientHeight+1 && document.querySelector('#rightText').scrollHeight<=document.querySelector('#rightText').clientHeight+1"));
        instrumentation.runOnMainSync(()->activity.finish());
    }
}

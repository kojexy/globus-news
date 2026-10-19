// Official SRG SSR streams, published at radioswissclassic.ch/en/reception/internet.
export const RADIO_STREAMS=[
  'https://stream.srg-ssr.ch/srgssr/rsc_de/mp3/128',
  'https://stream.srg-ssr.ch/srgssr/rsc_de/aac/96',
];
export function createRadio(audio,onStatus=()=>{}) {
  let enabled=false,suspended=false,blocked=false,timer=null,watchdog=null,attempt=0,source=0,generation=0;
  audio.preload='none';audio.volume=.12;
  const status=message=>{audio.dataset.status=message;onStatus(message);};
  const clear=()=>{clearTimeout(timer);clearTimeout(watchdog);timer=watchdog=null;};
  function stop(){generation++;clear();audio.pause();audio.removeAttribute('src');audio.load();}
  function retry(){if(!enabled||suspended||blocked||timer)return;clearTimeout(watchdog);audio.pause();status('Нет связи с радио. Повторное подключение…');timer=setTimeout(()=>{timer=null;source=(source+1)%RADIO_STREAMS.length;start();},Math.min(60000,3000*2**Math.min(attempt++,4)));}
  function start(){
    if(!enabled||suspended||blocked)return;
    clear();const token=++generation;status('Подключение к Radio Swiss Classic…');
    audio.src=RADIO_STREAMS[source];audio.load();watchdog=setTimeout(retry,25000);
    audio.play().catch(error=>{if(token!==generation||!enabled||suspended)return;if(error.name==='NotAllowedError'){clear();blocked=true;status('Нажмите любую кнопку, чтобы включить музыку.');}else retry();});
  }
  audio.addEventListener('playing',()=>{if(!enabled||suspended){stop();return;}clear();attempt=0;status('Играет Radio Swiss Classic');});
  audio.addEventListener('error',retry);audio.addEventListener('ended',retry);
  audio.addEventListener('waiting',()=>{if(enabled&&!suspended&&!watchdog)watchdog=setTimeout(retry,25000);});
  return {
    configure(next,volume){audio.volume=volume/100;if(next===enabled)return;enabled=next;blocked=false;attempt=0;if(enabled&&!suspended)start();else if(!enabled){stop();status('Выключено');}},
    suspend(){if(suspended)return;suspended=true;stop();if(enabled)status('Пауза, пока приложение закрыто');},
    resume(){if(!suspended)return;suspended=false;if(enabled){blocked=false;start();}},
    gesture(){if(enabled&&!suspended&&blocked){blocked=false;start();}},
    reconnect(){if(enabled&&!suspended){blocked=false;start();}},
  };
}

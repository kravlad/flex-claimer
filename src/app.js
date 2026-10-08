(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'flex-claimer.preferences.v1';
  const {config,translations,templates} = window.FLEX_CLAIMER_DATA;
  const russian = translations.ru;
  for (const key of config.issueTypes) {
    const option = document.createElement('option');
    option.value = key;option.textContent = templates[key].label;option.setAttribute('data-i18n','');
    $('type').append(option);
  }
  let language = 'en';
  const staticText = [...document.querySelectorAll('[data-i18n]')].map(el=>({el,source:el.textContent}));
  const translatedAttributes = [
    ...[...document.querySelectorAll('[data-i18n-placeholder]')].map(el=>({el,attribute:'placeholder',source:el.getAttribute('placeholder')})),
    ...[...document.querySelectorAll('[data-i18n-aria]')].map(el=>({el,attribute:'aria-label',source:el.getAttribute('aria-label')}))
  ];
  const dynamicText = new Map();
  const t = text => language === 'ru' ? (russian[text] ?? text) : text;
  function setUiText(id,source,suffix='') {
    dynamicText.set(id,{source,suffix});
    $(id).textContent=t(source)+suffix;
  }
  function applyLanguage() {
    document.documentElement.lang=language;
    document.title=t('Flex Claimer — contact support');
    $('language').value=language;
    for(const {el,source} of staticText)el.textContent=t(source);
    for(const {el,attribute,source} of translatedAttributes)el.setAttribute(attribute,t(source));
    for(const [id,{source,suffix}] of dynamicText)$(id).textContent=t(source)+suffix;
  }
  const recipientRows = [{checkbox:'sendSupport',email:'emailSupport'},{checkbox:'sendJeff',email:'emailJeff'},{checkbox:'sendCustom',email:'emailCustom'}];
  function selectedRecipientInputs() {
    return recipientRows.filter(row=>$(row.checkbox).checked).map(row=>$(row.email));
  }
  function uniqueAddresses(inputs) {
    const seen=new Set();
    return inputs.map(input=>input.value.trim()).filter(address=>{
      const key=address.toLowerCase();
      if(!address||seen.has(key))return false;
      seen.add(key);return true;
    });
  }
  function updateRecipientHint() {
    $('recipientHint').textContent=uniqueAddresses(selectedRecipientInputs()).join(', ');
  }
  const defaults = Object.fromEntries(config.issueTypes.map(key=>[key,templates[key]]));
  const emailText = config.emailText;
  let preferences = {templates:{}};
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      for (const key of Object.keys(defaults)) {
        const t = saved.templates?.[key];
        if (t && typeof t.subject === 'string' && typeof t.body === 'string' && !FlexTemplating.check(t.subject) && !FlexTemplating.check(t.body)) preferences.templates[key] = {subject:t.subject,body:t.body};
      }
      if(typeof saved.name === 'string')preferences.name=saved.name;
      if(saved.language==='en'||saved.language==='ru')preferences.language=saved.language;
      if(saved.addresses&&typeof saved.addresses==='object'){
        preferences.addresses={};
        if(typeof saved.addresses.custom==='string')preferences.addresses.custom=saved.addresses.custom.slice(0,254);
      }
    }
  } catch {}
  $('name').value = preferences.name || '';
  $('sendSupport').checked=config.recipients.support.checked;$('sendJeff').checked=config.recipients.jeff.checked;$('sendCustom').checked=false;
  $('emailSupport').value=config.recipients.support.address;
  $('emailJeff').value=config.recipients.jeff.address;
  $('emailCustom').value=preferences.addresses?.custom ?? '';
  language=preferences.language || 'en';
  let edited = false, pending = false;
  function savePreferences() {
    preferences.name = $('name').value.trim();
    preferences.language = language;
    preferences.addresses={custom:$('emailCustom').value.trim()};
    try {localStorage.setItem(STORAGE_KEY,JSON.stringify(preferences));return true;} catch {return false;}
  }
  function activeTemplate(){return preferences.templates[$('type').value] || defaults[$('type').value];}
  function formatDate(value){
    if (!value) return emailText.missingDate;
    const [y,m,d] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US',{year:'numeric',month:'long',day:'numeric'}).format(new Date(y,m-1,d,12));
  }
  function formatTime(value){
    if (!value) return '';
    const [h,m] = value.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h < 12 ? 'AM' : 'PM'}`;
  }
  function values(){
    const date=formatDate($('date').value),start=formatTime($('start').value),end=$('end').value ? formatTime($('end').value):'';
    const overnight=$('end').value && $('start').value && $('end').value < $('start').value;
    const time=start ? `, ${start}${end ? `–${end}${overnight?` (${emailText.overnight})`:''}`:''}` : end ? ` (${emailText.endingAt} ${end})` : '';
    return {date,start,end,block:date+time,station:$('station').value.trim(),name:$('name').value.trim(),details:$('details').value.trim()};
  }
  function fill(template,data){
    if(!data.start)template=template.replace(/,\s*\{\{\s*start\s*\}\}/g,'');
    return FlexTemplating.render(template,data);
  }
  function contains(template,key){return new RegExp('\\{\\{\\s*'+key+'\\s*\\}\\}').test(template);}
  function render(){
    const t=activeTemplate(),data=values();
    $('subject').value=fill(t.subject,data);
    let body=fill(t.body,data).trim();
    if(data.station&&!contains(t.body,'station')) body+=`\n\n${emailText.stationLabel} ${data.station}`;
    if(data.details&&!contains(t.body,'details')) body+=`\n\n${emailText.detailsLabel}\n${data.details}`;
    if(!data.start&&!body.includes(emailText.unknownStartTime)) body+=`\n\n${emailText.unknownStartTime}`;
    if(!contains(t.body,'name')) body+=`\n\n${emailText.signoff}${data.name?'\n'+data.name:''}`;
    $('body').value=body;
    edited=false;pending=false;$('pendingNotice').hidden=true;setUiText('draftBadge','Template');setUiText('error','');setUiText('actionStatus','');
  }
  function parametersChanged(){
    setUiText('actionStatus','');
    if(edited){pending=true;$('pendingNotice').hidden=false;}else render();
  }
  function loadEditor(){
    const t=activeTemplate();$('templateSubject').value=t.subject;$('templateBody').value=t.body;
    setUiText('typeHint',defaults[$('type').value].hint);setUiText('templateStatus','');
    if($('type').value==='custom')$('templateEditor').open=true;
  }
  $('type').addEventListener('change',()=>{loadEditor();parametersChanged();});
  for(const id of ['date','start','end','station','name','details'])$(id).addEventListener('input',parametersChanged);
  for(const id of ['subject','body'])$(id).addEventListener('input',()=>{edited=true;setUiText('draftBadge','Edited by you');setUiText('error','');setUiText('actionStatus','');});
  $('name').addEventListener('change',savePreferences);
  for(const {checkbox,email} of recipientRows){
    $(checkbox).addEventListener('change',()=>{updateRecipientHint();setUiText('error','');setUiText('actionStatus','');});
    $(email).addEventListener('input',()=>{updateRecipientHint();setUiText('error','');setUiText('actionStatus','');});
    $(email).addEventListener('change',()=>{$(email).value=$(email).value.trim();updateRecipientHint();savePreferences();});
  }
  $('language').addEventListener('change',()=>{language=$('language').value==='en'?'en':'ru';applyLanguage();savePreferences();});
  $('regenerate').addEventListener('click',render);
  function replaceTemplate(callback){
    if(edited&&!window.confirm(t('Replace your manual email edits with the template text?')))return;
    callback();const stored=savePreferences();loadEditor();render();
    setUiText('templateStatus',stored?'Template saved in this browser.':'Template applied. Browser storage is unavailable, so it may be lost after closing the page.');
  }
  $('saveTemplate').addEventListener('click',()=>{
    const subject=$('templateSubject').value.trim(),body=$('templateBody').value.trim();
    if(!subject||!body){setUiText('templateStatus','Enter a template subject and body.');return;}
    const problem=FlexTemplating.check(subject)||FlexTemplating.check(body);
    if(problem){setUiText('templateStatus',problem.message,problem.detail);return;}
    replaceTemplate(()=>{preferences.templates[$('type').value]={subject,body};});
  });
  $('resetTemplate').addEventListener('click',()=>{if(!window.confirm(t('Restore the default template for this issue type?')))return;replaceTemplate(()=>{delete preferences.templates[$('type').value];});});
  function validate(){
    setUiText('error','');
    if(!$('blockForm').reportValidity()){
      setUiText('error','Enter the block date, then select “Create email”.');
      $('error').scrollIntoView({block:'center'});
      return false;
    }
    if(pending){setUiText('error','The details have changed. Select “Update from template”, then review the email.');$('regenerate').focus();return false;}
    if(!edited)render();
    if(!$('subject').value.trim()||!$('body').value.trim()){setUiText('error','Enter an email subject and body.');return false;}
    if(/\{\{[^{}]+\}\}/.test($('subject').value+'\n'+$('body').value)){setUiText('error','The email still contains template variables. Replace them with actual values.');return false;}
    return true;
  }
  $('createEmail').addEventListener('click',()=>{
    if(!validate())return;
    const selectedInputs=selectedRecipientInputs();
    if(!selectedInputs.length){setUiText('error','Select an email recipient.');$('sendSupport').focus();return;}
    for(const input of selectedInputs){
      input.value=input.value.trim();
      if(!input.reportValidity()){
        setUiText('error','Enter a valid email address for each selected recipient.');return;
      }
    }
    const selectedRecipients=uniqueAddresses(selectedInputs);
    updateRecipientHint();
    savePreferences();
    const subject=$('subject').value.replace(/[\r\n]+/g,' ');
    const body=$('body').value.replace(/\r?\n/g,'\r\n');
    const url='mailto:'+selectedRecipients.map(address=>encodeURIComponent(address).replace(/%40/g,'@')).join(',')+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
    const link=document.createElement('a');link.href=url;document.body.appendChild(link);link.click();link.remove();
    setUiText('actionStatus','Your mail app was requested to open. If no draft appeared, use Copy text.');
  });
  $('copy').addEventListener('click',async()=>{
    if(!validate())return;
    const text=$('body').value;
    try {
      if(!navigator.clipboard?.writeText)throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(text);
    } catch {
      const temp=document.createElement('textarea');temp.value=text;temp.style.cssText='position:fixed;top:0;left:0;opacity:0';temp.setAttribute('readonly','');document.body.appendChild(temp);temp.select();temp.setSelectionRange(0,temp.value.length);
      let success=false;try {success=document.execCommand('copy');}catch{}temp.remove();
      if(!success){$('body').focus();$('body').select();setUiText('actionStatus','The text is selected. Copy it using the menu or Ctrl/Cmd+C.');return;}
    }
    setUiText('actionStatus','Email body copied.');
  });
  $('blockForm').addEventListener('submit',event=>{event.preventDefault();$('createEmail').click();});
  applyLanguage();updateRecipientHint();loadEditor();render();
})();

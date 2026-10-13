(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'flex-claimer.preferences.v1';
  const {config,translations,templates} = window.FLEX_CLAIMER_DATA;
  const russian = translations.ru;
  // Issue type menu: groups sorted by name, each with its templates in file-name order, then the templates
  // without a group. Built before the translatable text is collected below, so its labels get translated.
  const groups = new Map(), ungrouped = [];
  for (const [key,{label,group}] of Object.entries(templates)) {
    if (!group) ungrouped.push({key,label});
    else { if (!groups.has(group)) groups.set(group,[]); groups.get(group).push({key,label}); }
  }
  const typeTree = [...[...groups].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([label,items])=>({label,items})),...ungrouped];
  const typeMenu = FlexTypeMenu.create({container:$('typeMenu'),input:$('type'),labelId:'typeLabel',tree:typeTree});
  $('type').value = typeMenu.firstKey;typeMenu.sync();
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
  const defaults = templates;
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
  const fieldIds = ['date', 'start', 'end', 'station', 'name', 'details'];
  let activeFields = new Set();
  function updateFields(template){
    const rules=FlexTemplating.fields(template.subject,template.body);
    activeFields = new Set(rules.visible);
    const requiredFields=new Set(rules.required);
    for(const id of fieldIds){
      const visible=activeFields.has(id);
      $(id).closest('.field').hidden=!visible;
      $(id).disabled=!visible;
      $(id).required=visible&&requiredFields.has(id);
      $(id).setCustomValidity('');
      setUiText(`${id}Requirement`,$(id).required?'· required':'· optional');
    }
    const timeRow=$('start').closest('.row');
    timeRow.hidden=!activeFields.has('start')&&!activeFields.has('end');
    timeRow.classList.toggle('single-field',activeFields.has('start')!==activeFields.has('end'));
  }
  function formatDate(value){
    if (!value) return '';
    const [y,m,d] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US',{year:'numeric',month:'long',day:'numeric'}).format(new Date(y,m-1,d,12));
  }
  function formatTime(value){
    if (!value) return '';
    const [h,m] = value.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h < 12 ? 'AM' : 'PM'}`;
  }
  function values(){
    const value=id=>activeFields.has(id)?$(id).value:'';
    const startValue=value('start'),endValue=value('end');
    const date=formatDate(value('date')),start=formatTime(startValue),end=formatTime(endValue);
    const overnight=endValue && startValue && endValue < startValue;
    const time=start ? `${start}${end ? `–${end}${overnight?` (${emailText.overnight})`:''}`:''}` : end ? `(${emailText.endingAt} ${end})` : '';
    const block=[date,time].filter(Boolean).join(start?', ':' ');
    return {date,start,end,block,station:value('station').trim(),name:value('name').trim(),details:value('details').trim()};
  }
  function fill(template,data){
    if(!data.start)template=template.replace(/,\s*\{\{\s*(?:req:)?start\s*\}\}/g,'');
    return FlexTemplating.render(template,data);
  }
  function contains(template,key){return new RegExp('\\{\\{\\s*(?:req:)?'+key+'\\s*\\}\\}').test(template);}
  function render(){
    const t=activeTemplate(),data=values();
    $('subject').value=fill(t.subject,data);
    let body=fill(t.body,data).trim();
    if(data.station&&!contains(t.body,'station')) body+=`\n\n${emailText.stationLabel} ${data.station}`;
    if(data.details&&!contains(t.body,'details')) body+=`\n\n${emailText.detailsLabel}\n${data.details}`;
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
    updateFields(t);
    setUiText('typeButtonText',defaults[$('type').value].label);setUiText('typeHint',defaults[$('type').value].hint);setUiText('templateStatus','');
    if($('type').value==='custom')$('templateEditor').open=true;
  }
  $('type').addEventListener('change',()=>{loadEditor();parametersChanged();});
  for(const id of fieldIds)$(id).addEventListener('input',()=>{$(id).setCustomValidity('');parametersChanged();});
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
    for(const id of fieldIds){
      const input=$(id);
      input.setCustomValidity(input.required&&!input.value.trim()?t('Fill in this required field.'):'');
    }
    if(!$('blockForm').reportValidity()){
      setUiText('error','Check the highlighted fields, then select “Create email”.');
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

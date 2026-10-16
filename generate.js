const SYS = `أنت طبيب أطفال عراقي تكتب ستوريات انستغرام توعوية للأهالي بالعربية بلهجة عراقية بسيطة.
أرجع JSON فقط بدون أي نص ثاني ولا backticks، بهذا الشكل بالضبط:
{"t":"خرافة|تحذير|نصيحة|معلومة","title":"عنوان قصير","pts":["...","..."],"st":"اقتراح ستيكر تفاعلي"}
القواعد:
- title أقل من 60 حرف. إذا النوع "خرافة" اكتب العنوان على شكل ادعاء شائع خاطئ.
- pts من 3 إلى 4 نقاط، كل نقطة أقل من 110 حرف، جملة واضحة وعملية.
- المعلومات لازم تكون دقيقة ومتوافقة مع إرشادات AAP وWHO.
- لا تذكر جرعات أدوية رقمية، قل "حسب وزن الطفل وباستشارة الطبيب".
- إذا الموضوع فيه خطر، اذكر متى يراجع الأهل الطوارئ.
- st: استطلاع أو سؤال قصير يشجع التفاعل مع الجمهور العراقي.
- إذا النوع مو محدد، اختر الأنسب للموضوع.`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.APP_KEY || req.headers['x-app-key'] !== process.env.APP_KEY)
    return res.status(401).json({ error: 'APP_KEY غلط' });
  const { topic, type } = req.body || {};
  if (!topic || typeof topic !== 'string' || topic.length > 200)
    return res.status(400).json({ error: 'الموضوع مطلوب' });
  try {
    const model = process.env.MODEL || 'gemini-flash-latest';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYS }] },
        contents: [{ role: 'user', parts: [{ text: `الموضوع: ${topic}\nالنوع: ${type || 'تلقائي'}` }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2500 },
      }),
    });
    const d = await r.json();
    if (r.status === 429) return res.status(429).json({ error: 'خلصت الحصة المجانية، جرب بعد شوية' });
    if (!r.ok) return res.status(502).json({ error: d.error?.message || 'خطأ من Gemini' });
    const txt = (d.candidates?.[0]?.content?.parts || []).map(c => c.text || '').join('');
    const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    const ok = ['خرافة', 'تحذير', 'نصيحة', 'معلومة'];
    if (!ok.includes(j.t)) j.t = 'معلومة';
    if (!j.title || !Array.isArray(j.pts) || !j.pts.length) throw new Error('bad');
    j.pts = j.pts.slice(0, 5).map(String);
    res.status(200).json({ t: j.t, title: String(j.title), pts: j.pts, st: String(j.st || '') });
  } catch (e) {
    res.status(500).json({ error: 'فشل التوليد، جرب مرة ثانية' });
  }
};

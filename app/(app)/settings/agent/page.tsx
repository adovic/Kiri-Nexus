"use client";

// This must be BELOW "use client"
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter } from 'next/navigation';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseClient } from '../../../../lib/firebase/client'; 

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function AgentSettingsPage() {
  const router = useRouter();
  const { db, auth } = getFirebaseClient();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // --- DATA STATE (Matches Onboarding Schema) ---
  const [agentName, setAgentName] = useState("");
  const [tone, setTone] = useState("friendly"); 
  const [greeting, setGreeting] = useState("");
  
  const [businessName, setBusinessName] = useState("");
  const [address, setAddress] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [goldenRules, setGoldenRules] = useState(""); 
  
  const [schedule, setSchedule] = useState<any>(
    DAYS.reduce((acc, day) => ({ 
        ...acc, 
        [day]: { open: "09:00", close: "17:00", isClosed: day === "Saturday" || day === "Sunday" } 
    }), {})
  );

  // ADVANCED: Special Events
  const [specialEvents, setSpecialEvents] = useState<{date: string, type: string, note: string, recurring: boolean}[]>([]);
  const [newEvent, setNewEvent] = useState({ date: "", type: "closed", note: "", recurring: false });

  // FILES
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [existingFiles, setExistingFiles] = useState<string[]>([]);

  // --- LOAD DATA ---
  useEffect(() => {
    const loadUserData = async () => {
        if (!auth || !auth.currentUser || !db) return;

        try {
            const docRef = doc(db, "tenants", auth.currentUser.uid);
            const snap = await getDoc(docRef);
            
            if (snap.exists()) {
                const data = snap.data();
                
                // 1. ACCESS CONTROL: Redirect if onboarding not started/in-progress
                // (Commented out for now so you don't get locked out while testing)
                // if (!data.onboardingStatus) { router.push('/onboarding'); return; }

                // 2. PRE-FILL DATA from Onboarding
                if (data.agentName) setAgentName(data.agentName);
                if (data.tone) setTone(data.tone);
                if (data.greeting) setGreeting(data.greeting);
                
                if (data.businessName) setBusinessName(data.businessName);
                if (data.address) setAddress(data.address);
                if (data.emergencyPhone) setEmergencyPhone(data.emergencyPhone);
                if (data.goldenRules) setGoldenRules(data.goldenRules);
                if (data.weeklySchedule) setSchedule(data.weeklySchedule);
                
                if (data.website) setWebsiteUrl(data.website);
                if (data.uploadedFiles) setExistingFiles(data.uploadedFiles);

                // 3. LOAD ADVANCED DATA (If exists)
                if (data.specialEvents) setSpecialEvents(data.specialEvents);
            }
        } catch (e) {
            console.error("Error loading settings:", e);
        } finally {
            setLoading(false);
        }
    };
    
    setTimeout(loadUserData, 800);
  }, [auth, db, router]);

  // --- ACTIONS ---
  const updateSchedule = (day: string, field: string, value: any) => {
      setSchedule((prev: any) => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  const addSpecialEvent = () => {
      if (!newEvent.date) return alert("Please select a date.");
      setSpecialEvents([...specialEvents, newEvent]);
      setNewEvent({ date: "", type: "closed", note: "", recurring: false }); 
  };

  const removeEvent = (idx: number) => {
      setSpecialEvents(specialEvents.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
        if (!auth || !auth.currentUser || !db) return;
        
        await setDoc(doc(db, "tenants", auth.currentUser.uid), {
            agentName, tone, greeting,
            businessName, address, emergencyPhone, goldenRules,
            weeklySchedule: schedule, 
            specialEvents: specialEvents, 
            website: websiteUrl,
            updatedAt: new Date()
        }, { merge: true });
        
        alert("Agent updated successfully!");
    } catch (e) {
        console.error(e);
        alert("Error saving settings.");
    } finally {
        setSaving(false);
    }
  };

  if (loading) return <div style={{padding: 50, color: '#666', textAlign: 'center'}}>Loading your agent's brain...</div>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 40, fontFamily: 'sans-serif', color: 'white', paddingBottom: 100 }}>
      
      {/* HEADER WITH SAVE BUTTON */}
      <div style={{
          display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 40,
          position: 'sticky', top: 20, zIndex: 10, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)',
          padding: '20px', borderRadius: 12, border: '1px solid #333'
      }}>
          <div>
            <h1 style={{fontSize: 24, margin: 0, color: 'white'}}>Agent Settings</h1>
            <p style={{color: '#888', fontSize: 13, margin: '5px 0 0 0'}}>Manage behavior, hours, and overrides.</p>
          </div>
          <div style={{display:'flex', gap: 10}}>
             <button onClick={() => router.push('/dashboard')} style={secondaryBtnStyle}>Cancel</button>
             <button onClick={handleSave} style={primaryBtnStyle}>
                {saving ? "Saving..." : "Save Changes"}
             </button>
          </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>

        {/* SECTION 1: IDENTITY */}
        <section style={sectionStyle}>
            <h3 style={headerStyle}>1. Identity & Tone</h3>
            <div style={grid2}>
                <div><label style={labelStyle}>Agent Name</label><input style={inputStyle} value={agentName} onChange={e => setAgentName(e.target.value)} /></div>
                <div><label style={labelStyle}>Tone</label>
                    <select style={inputStyle} value={tone} onChange={e => setTone(e.target.value)}>
                        <option value="friendly">Friendly</option><option value="professional">Professional</option>
                    </select>
                </div>
            </div>
            <div style={{marginTop: 20}}>
                <label style={labelStyle}>Greeting Script</label>
                <textarea style={{...inputStyle, height: 80}} value={greeting} onChange={e => setGreeting(e.target.value)} />
            </div>
        </section>

        {/* SECTION 2: OPERATIONS */}
        <section style={sectionStyle}>
            <h3 style={headerStyle}>2. Operations & Schedule</h3>
            <div style={{marginBottom: 20}}>
                <label style={labelStyle}>Business Name</label>
                <input style={inputStyle} value={businessName} onChange={e => setBusinessName(e.target.value)} />
            </div>
            
            {/* SCHEDULE GRID */}
            <div style={{background: '#080808', border: '1px solid #333', borderRadius: 8, overflow: 'hidden', marginBottom: 20}}>
                {DAYS.map((day) => (
                    <div key={day} style={{ display: 'flex', alignItems: 'center', padding: '10px 15px', borderBottom: '1px solid #222', gap: 15, fontSize: 13 }}>
                        <div style={{ width: 90, color: '#ccc' }}>{day}</div>
                        <input type="checkbox" checked={schedule[day]?.isClosed} onChange={(e) => updateSchedule(day, 'isClosed', e.target.checked)} />
                        <span style={{width: 50, color: schedule[day]?.isClosed ? '#ef4444' : '#666'}}>{schedule[day]?.isClosed ? "Closed" : "Open"}</span>
                        {!schedule[day]?.isClosed && (
                            <>
                                <input type="time" value={schedule[day]?.open} onChange={e => updateSchedule(day, 'open', e.target.value)} style={{...inputStyle, padding: 4, width: 90}} />
                                <span style={{color:'#444'}}>-</span>
                                <input type="time" value={schedule[day]?.close} onChange={e => updateSchedule(day, 'close', e.target.value)} style={{...inputStyle, padding: 4, width: 90}} />
                            </>
                        )}
                    </div>
                ))}
            </div>

            <div style={grid2}>
                <div>
                     <label style={labelStyle}>Physical Address</label>
                     <input style={inputStyle} value={address} onChange={e => setAddress(e.target.value)} />
                </div>
                <div>
                     <label style={{...labelStyle, color: '#ef4444'}}>Emergency Escalation #</label>
                     <input style={{...inputStyle, borderColor: '#552222'}} value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} />
                </div>
            </div>

            <div style={{marginTop: 20}}>
                <label style={labelStyle}>Golden Rules (AI Instructions)</label>
                <textarea style={{...inputStyle, height: 100}} value={goldenRules} onChange={e => setGoldenRules(e.target.value)} />
            </div>
        </section>

        {/* SECTION 3: HOLIDAYS & SPECIALS (THE NEW FEATURE) */}
        <section style={{...sectionStyle, borderColor: '#EAB308'}}>
            <h3 style={{...headerStyle, color: '#EAB308'}}>3. Holidays & Special Events</h3>
            <p style={{fontSize: 13, color: '#ccc', marginBottom: 20}}>
                Overrides your normal schedule for specific dates (e.g. "Christmas", "Staff Party").
            </p>

            <div style={{background: '#1a1a1a', padding: 20, borderRadius: 8, border: '1px solid #333', marginBottom: 20}}>
                <div style={{display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap'}}>
                    <div style={{flex: 1, minWidth: 140}}>
                        <label style={labelStyle}>Date</label>
                        <input type="date" style={inputStyle} value={newEvent.date} onChange={e => setNewEvent({...newEvent, date: e.target.value})} />
                    </div>
                    <div style={{flex: 1, minWidth: 120}}>
                        <label style={labelStyle}>Type</label>
                        <select style={inputStyle} value={newEvent.type} onChange={e => setNewEvent({...newEvent, type: e.target.value})}>
                            <option value="closed">Closed</option>
                            <option value="pricing">Special Price</option>
                            <option value="note">Info Note</option>
                        </select>
                    </div>
                    <div style={{flex: 2, minWidth: 200}}>
                        <label style={labelStyle}>Note / Instruction</label>
                        <input style={inputStyle} placeholder="e.g. Christmas Day" value={newEvent.note} onChange={e => setNewEvent({...newEvent, note: e.target.value})} />
                    </div>
                    <div style={{textAlign: 'center', paddingBottom: 10}}>
                        <label style={{fontSize: 10, color: '#888', display:'block'}}>Yearly?</label>
                        <input type="checkbox" checked={newEvent.recurring} onChange={e => setNewEvent({...newEvent, recurring: e.target.checked})} />
                    </div>
                    <button onClick={addSpecialEvent} style={{...primaryBtnStyle, height: 42, marginBottom: 1}}>Add Override</button>
                </div>
            </div>

            {/* EVENT LIST */}
            {specialEvents.length === 0 && <div style={{textAlign:'center', color: '#444', padding: 20}}>No special events configured.</div>}
            
            <div style={{display:'flex', flexDirection:'column', gap: 8}}>
                {specialEvents.map((evt, i) => (
                    <div key={i} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#222', padding: '12px 15px', borderRadius: 6, borderLeft: `3px solid ${evt.type === 'closed' ? '#ef4444' : '#EAB308'}`}}>
                        <div>
                            <strong style={{color: 'white', marginRight: 10}}>{evt.date}</strong>
                            {evt.recurring && <span style={{fontSize: 10, background: '#444', color: '#ccc', padding: '2px 6px', borderRadius: 4}}>YEARLY</span>}
                            <span style={{color: '#666', margin: '0 10px'}}>—</span>
                            <span style={{color: '#ccc'}}>{evt.note}</span>
                        </div>
                        <button onClick={() => removeEvent(i)} style={{background:'none', border:'none', color:'#666', cursor:'pointer'}}>✕</button>
                    </div>
                ))}
            </div>
        </section>

        {/* SECTION 4: FILES */}
        <section style={sectionStyle}>
            <h3 style={headerStyle}>4. Knowledge Base</h3>
            
            <div style={{marginBottom: 20}}>
                <label style={labelStyle}>Scrape Website</label>
                <div style={{display:'flex', gap: 10}}>
                    <input style={inputStyle} value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder="https://..." />
                    <button style={secondaryBtnStyle}>Update</button>
                </div>
            </div>

            <div style={{marginBottom: 10}}>
                <label style={labelStyle}>Current Files</label>
                {existingFiles.length === 0 && <div style={{fontSize: 13, color: '#666'}}>No files uploaded.</div>}
                {existingFiles.map((f, i) => (
                    <div key={i} style={{padding: 10, borderBottom: '1px solid #222', color: '#ccc', fontSize: 14}}>📄 {f}</div>
                ))}
            </div>

            <div style={{marginTop: 20, borderTop: '1px solid #222', paddingTop: 20}}>
                    <label style={labelStyle}>Upload New Documents</label>
                    <input type="file" multiple style={{color: '#888'}} />
            </div>
        </section>

      </div>
    </div>
  );
}

// --- STYLES ---
const sectionStyle = { background: '#111', padding: 30, borderRadius: 12, border: '1px solid #222' };
const headerStyle = { marginTop: 0, marginBottom: 20, fontSize: 18, color: 'white', textTransform: 'uppercase' as const, letterSpacing: 1 };
const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 };
const labelStyle = { display: 'block', marginBottom: 8, fontWeight: 'bold', fontSize: 12, color: '#888', textTransform: 'uppercase' as const };
const inputStyle = { width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #333', background: '#080808', color: 'white', fontSize: '14px', outline: 'none' };
const primaryBtnStyle = { background: '#EAB308', color: 'black', border: 'none', padding: '10px 20px', borderRadius: 6, fontWeight: 'bold' as const, cursor: 'pointer', fontSize: '14px' };
const secondaryBtnStyle = { background: 'transparent', color: '#ccc', border: '1px solid #444', padding: '10px 20px', borderRadius: 6, cursor: 'pointer', fontSize: '14px' };
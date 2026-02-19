import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fortuneDrawAPI, homeSettingsAPI } from '../services/api';
import { formatDistanceToNow } from 'date-fns';
import './Home.css';

function Home() {
  const [lotteries, setLotteries] = useState([]);
  const [homeSettings, setHomeSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActiveLotteries();
    fetchHomeSettings();
  }, []);

  const fetchHomeSettings = async () => {
    try {
      const response = await homeSettingsAPI.getSettings();
      if (response.data.success) {
        setHomeSettings(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching home settings:', error, error?.response?.data || error?.toString());
      // Use defaults
      setHomeSettings({
        hero_title: 'Welcome to Fortune Friends',
        hero_subtitle: 'Friends Who Bring Fortune',
        features: [],
        how_it_works: []
      });
    }
  };

  const fetchActiveLotteries = async () => {
    try {
      const response = await fortuneDrawAPI.getActive();
      // Get all active lotteries
      const fortuneDrawData = response.data.data;
      
      // If it's an array, use it directly, otherwise put single lottery in array
      const lotteriesArray = Array.isArray(fortuneDrawData) ? fortuneDrawData : [fortuneDrawData];
      
      // Fetch stats for each lottery
      const lotteriesWithStats = await Promise.all(
        lotteriesArray.map(async (lottery) => {
          try {
            const statsResponse = await fortuneDrawAPI.getStats(lottery.id);
            return { ...lottery, stats: statsResponse.data.data };
          } catch (error) {
            return { ...lottery, stats: { total_participants: 0 } };
          }
        })
      );
      
      setLotteries(lotteriesWithStats);
    } catch (error) {
      console.error('Error fetching lotteries:', error, error?.response?.data || error?.toString());
    } finally {
      setLoading(false);
    }
  };

  const getCountdown = (drawDate) => {
    const date = new Date(drawDate);
    return formatDistanceToNow(date, { addSuffix: true });
  };

  if (loading || !homeSettings) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  if (lotteries.length === 0) {
    return (
      <div className="home">
        <div className="alert alert-warning">
          No Active Fortune Draw at the moment. Check back soon!
        </div>
      </div>
    );
  }

  return (
    <div className="home">
      {/* Welcome Banner */}
      <div className="welcome-banner" style={{
        width: '100%',
        maxWidth: '100%',
        margin: '0 auto 32px',
        borderRadius: '18px',
        overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
        position: 'relative',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '220px',
        marginBottom: '32px',
      }}>
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          background: 'linear-gradient(90deg, rgba(10,31,68,0.7) 0%, rgba(218,165,32,0.3) 100%)',
          textShadow: '0 2px 8px rgba(0,0,0,0.25)',
        }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: 8 }}>Welcome to Fortune Friends!</h1>
          <p style={{ fontSize: '1.3rem', fontWeight: 500, margin: 0 }}>Join, Refer, and Win Big Prizes Every Year!</p>
        </div>
      </div>

      {/* Announcement Banner */}
      {homeSettings.announcement && (
        <div className="alert" style={{ 
          background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
          color: '#000',
          fontWeight: '600',
          textAlign: 'center',
          padding: '15px',
          marginBottom: '20px',
          borderRadius: '8px'
        }}>
          📢 {homeSettings.announcement}
        </div>
      )}

      <section className="hero">
        <h1>✨ {homeSettings.hero_title}</h1>
        <p className="hero-subtitle">
          {homeSettings.hero_subtitle}
        </p>
        {homeSettings.hero_description && (
          <p style={{ textAlign: 'center', fontSize: '18px', marginBottom: '30px', maxWidth: '800px', margin: '0 auto 30px' }}>
            {homeSettings.hero_description}
          </p>
        )}
        
        {lotteries.map((lottery) => {
          // Use image_url from database, fallback to placeholder
          const backendImage = lottery.image_url && !lottery.image_url.startsWith('http') 
            ? `https://fortune-friends-backend-1.onrender.com${lottery.image_url}`
            : lottery.image_url;
          const placeholderImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="600" height="350"%3E%3Crect fill="%230A1F44" width="600" height="350"/%3E%3Ctext fill="%23FFD700" font-family="Arial" font-size="24" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EPrize Image%3C/text%3E%3C/svg%3E';
          const carImage = backendImage || placeholderImage;
          const carType = lottery.prize_type === 'car' ? lottery.prize_details : 'Prize';
          
          return (
            <div key={lottery.id} className="fortune-draw-section">
              <h2 className="fortune-draw-title">{lottery.name}</h2>
              
              <div className="car-showcase">
                <img 
                  src={carImage} 
                  alt={lottery.prize_details || lottery.name} 
                  className="car-image"
                  onError={(e) => {
                    if (e.target.src !== placeholderImage) {
                      e.target.src = placeholderImage;
                    }
                  }}
                />
                {lottery.prize_type === 'car' && <div className="car-badge">{carType}</div>}
              </div>
              
              <div className="hero-stats">
                <div className="stat-card">
                  <div className="stat-value" style={{ fontSize: lottery.prize_type === 'car' ? '28px' : '36px' }}>
                    {lottery.prize_type === 'car' ? `🚗 ${lottery.prize_details}` : `₹${lottery.prize_amount.toLocaleString()}`}
                  </div>
                  <div className="stat-label">{lottery.prize_type === 'car' ? 'Grand Prize' : 'Cash Prize'}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">₹{lottery.ticket_price}</div>
                  <div className="stat-label">Per Ticket</div>
                </div>
              </div>
            </div>
          );
        })}
      </section>
      
      {/* Features Section */}
      {homeSettings.features && homeSettings.features.length > 0 && (
        <section className="features">
          <h2>Why Choose Fortune Friends</h2>
          <div className="grid grid-3">
            {homeSettings.features.map((feature, index) => (
              <div key={index} className="feature-card">
                <div className="feature-icon">{feature.title.substring(0, 2)}</div>
                <h3>{feature.title.substring(2).trim()}</h3>
                <p>{feature.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      
      {/* How It Works */}
      <section className="features">
        <h2>{homeSettings.how_it_works && homeSettings.how_it_works.length > 0 ? 'How Fortune Friends Works' : 'How Fortune Friends Works'}</h2>
        <p style={{ textAlign: 'center', color: 'var(--gold)', fontSize: '18px', marginBottom: '30px', fontWeight: '600' }}>
          {homeSettings.hero_subtitle}
        </p>
        
        <div className="grid grid-3">
          {homeSettings.how_it_works && homeSettings.how_it_works.length > 0 ? (
            homeSettings.how_it_works.map((step, index) => (
              <div key={index} className="feature-card">
                <div className="feature-icon">{step.step}.</div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
            ))
          ) : (
            <>
              <div className="feature-card">
                <div className="feature-icon">📝</div>
                <h3>1. Register</h3>
                <p>Sign up and get your unique referral code instantly</p>
              </div>
              
              <div className="feature-card">
                <div className="feature-icon">🎫</div>
                <h3>2. Buy Tickets</h3>
                <p>Purchase unlimited fortune draw tickets at ₹100 each</p>
              </div>
              
              <div className="feature-card">
                <div className="feature-icon">👥</div>
                <h3>3. Refer Friends</h3>
                <p>Share your referral link to get bonus entries</p>
              </div>
            </>
          )}
        </div>
      </section>
      
      <section className="info">
        <div className="card">
          <h2>Winning Formula</h2>
          <div className="formula">
            <div className="formula-item">
              <strong>Your Winning Chance =</strong>
            </div>
            <div className="formula-item">
              <span className="formula-term">Base Entries</span> (Tickets Purchased)
            </div>
            <div className="formula-plus">+</div>
            <div className="formula-item">
              <span className="formula-term">Bonus Entries</span> (Paid Referrals)
            </div>
          </div>
          <p className="text-muted" style={{ marginTop: '20px' }}>
            More tickets + more referrals = Higher winning probability!
          </p>
        </div>
        
        <div className="card disclaimer">
          <h3>⚠️ Important Disclaimer</h3>
          <p>{lotteries[0]?.disclaimer || 'This is a lottery-based promotional activity. Winning depends on chance and participation level. No guaranteed winnings.'}</p>
        </div>
      </section>
    </div>
  );
}

export default Home;
